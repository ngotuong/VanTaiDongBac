import { createPublicationInvalidationRepository } from '../../../server/repositories/publication-invalidation-repository.js';
import { runtimeConfig } from '../../../server/runtime-config.js';
import { loadPlatformContext } from '../../lib/request-context.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STREAM_WINDOW_MS = 12_000;
const QUERY_INTERVAL_MS = 1_500;

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function jsonError(error: unknown) {
  const status = Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : 'Không mở được kênh cập nhật dữ liệu.';
  return Response.json({ ok: false, error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await loadPlatformContext({
      module: 'transport',
      year: url.searchParams.get('year') || undefined
    });
    const config = runtimeConfig();
    if (!config.supabaseUrl || !config.serviceRoleKey) throw httpError(503, 'Kênh publication chưa được cấu hình.');
    const afterId = Math.max(0, Number(url.searchParams.get('after')) || 0);
    const repository = createPublicationInvalidationRepository({ httpError });
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const startedAt = Date.now();
        const close = () => {
          if (closed) return;
          closed = true;
          controller.close();
        };
        const write = (value: string) => {
          if (!closed) controller.enqueue(encoder.encode(value));
        };
        const poll = async () => {
          if (closed || request.signal.aborted) return close();
          try {
            const row = await repository.findNext(config, {
              year: context.workbook.year,
              afterId,
              audience: config.publicationInvalidationAudience
            });
            if (row) {
              const event = {
                id: Number(row.id),
                year: String(row.workbook_year || ''),
                reportMonth: String(row.report_month || ''),
                generationId: String(row.generation_id || ''),
                sourceDataVersion: String(row.source_data_version || ''),
                cacheVersion: String(row.cache_version || ''),
                publishedAt: String(row.published_at || '')
              };
              write(`id: ${event.id}\nevent: publication\ndata: ${JSON.stringify(event)}\n\n`);
              return close();
            }
            write(`: publication-heartbeat ${Date.now()}\n\n`);
          } catch {
            write(': publication-retry\n\n');
          }
          if (Date.now() - startedAt >= STREAM_WINDOW_MS) return close();
          setTimeout(() => void poll(), QUERY_INTERVAL_MS);
        };
        write('retry: 1000\n\n');
        void poll();
        request.signal.addEventListener('abort', close, { once: true });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
