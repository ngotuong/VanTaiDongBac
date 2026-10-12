const crypto = require('node:crypto');

function createWriteJobRepository({ fetchImpl = fetch, httpError }) {
  const canonical = (value) => JSON.stringify(value, function (_key, item) {
    return item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item;
  });
  const assertSameIntent = (job, moduleName, action, payload) => {
    if (job.module !== moduleName || job.action !== action || canonical(job.payload) !== canonical(payload)) {
      throw httpError(409, 'clientRequestId đã được dùng cho nội dung khác. Vui lòng kiểm tra lệnh trước đó.');
    }
    return job;
  };
  const request = (url, options = {}) => fetchImpl(url, { ...options, signal: AbortSignal.timeout(8000) });
  const headers = (config, extra = {}) => ({
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra
  });
  const parse = async (response, message) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(response.status >= 400 && response.status < 500 ? response.status : 502, data.message || data.error || message);
    return data;
  };
  const normalize = (row) => ({
    ok: true,
    queued: row.status !== 'synced',
    jobId: row.id,
    module: row.module,
    action: row.action,
    status: row.status,
    payload: row.payload || {},
    result: row.result || null,
    idempotencyKey: row.idempotency_key || '',
    lastError: row.last_error || ''
  });
  const jobId = (moduleName, idempotencyKey) => `web-${crypto.createHash('sha256').update(`${moduleName}:${idempotencyKey}`).digest('hex').slice(0, 40)}`;

  async function find(config, id) {
    const query = new URLSearchParams({ select: 'id,module,action,status,payload,result,idempotency_key,last_error', id: `eq.${id}`, limit: '1' });
    const rows = await parse(await request(`${config.supabaseUrl}/rest/v1/write_jobs?${query}`, { headers: headers(config) }), 'Không đọc được trạng thái lệnh ghi.');
    return rows[0] ? normalize(rows[0]) : null;
  }

  async function enqueue(config, { moduleName, action, payload, idempotencyKey }) {
    const id = jobId(moduleName, idempotencyKey);
    const existing = await find(config, id);
    if (existing) return { ...assertSameIntent(existing, moduleName, action, payload), duplicateRequest: true };
    const row = {
      id,
      module: moduleName,
      action,
      status: 'pending',
      payload,
      attempts: 0,
      max_attempts: 3,
      last_error: '',
      next_run_at: new Date().toISOString(),
      idempotency_key: idempotencyKey
    };
    const response = await request(`${config.supabaseUrl}/rest/v1/write_jobs?on_conflict=id`, {
      method: 'POST',
      headers: headers(config, { Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify(row)
    });
    const rows = await parse(response, 'Không đưa được thao tác vào hàng đợi đồng bộ.');
    const queued = rows[0] ? normalize(rows[0]) : await find(config, id);
    if (!queued) throw httpError(502, 'Không xác nhận được trạng thái hàng đợi đồng bộ.');
    assertSameIntent(queued, moduleName, action, payload);
    await request(`${config.supabaseUrl}/rest/v1/write_job_logs`, {
      method: 'POST',
      headers: headers(config, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ job_id: id, status: 'pending', message: 'Write job queued by web API.', details: { action, module: moduleName, idempotencyKey } })
    }).catch(() => {});
    return queued;
  }

  return { enqueue, find };
}

module.exports = { createWriteJobRepository };
