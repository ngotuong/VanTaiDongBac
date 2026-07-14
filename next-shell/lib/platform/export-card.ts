type Html2Canvas = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

let html2CanvasLoader: Promise<Html2Canvas> | null = null;

function loadHtml2Canvas() {
  const current = (window as Window & { html2canvas?: Html2Canvas }).html2canvas;
  if (current) return Promise.resolve(current);
  if (html2CanvasLoader) return html2CanvasLoader;
  html2CanvasLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js';
    script.async = true;
    script.onload = () => {
      const loaded = (window as Window & { html2canvas?: Html2Canvas }).html2canvas;
      if (loaded) resolve(loaded);
      else reject(new Error('Không thể tải thư viện xuất ảnh.'));
    };
    script.onerror = () => reject(new Error('Không thể tải thư viện xuất ảnh.'));
    document.head.appendChild(script);
  });
  return html2CanvasLoader;
}

export async function exportCardAsImage(button: HTMLButtonElement, title: string) {
  const card = button.closest<HTMLElement>('.table-card');
  if (!card) return;
  button.disabled = true;
  card.classList.add('is-exporting');
  try {
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(card, {
      backgroundColor: '#ffffff',
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true
    });
    const link = document.createElement('a');
    link.download = `${title}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Không thể xuất ảnh.');
  } finally {
    card.classList.remove('is-exporting');
    button.disabled = false;
  }
}

export function exportTableAsCsv(button: HTMLButtonElement, fallbackTitle: string) {
  const card = button.closest<HTMLElement>('.table-card');
  const table = card?.querySelector('table');
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('tr'))
    .filter((row) => !(row as HTMLElement).hidden)
    .map((row) => Array.from(row.children).map((cell) => {
      const value = String(cell.textContent || '').replace(/\s+/g, ' ').trim();
      return `"${value.replaceAll('"', '""')}"`;
    }).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + rows], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  const title = card?.querySelector('.table-title')?.textContent || fallbackTitle || 'bao-cao';
  anchor.href = url;
  anchor.download = `${removeAccents(title).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'bao-cao'}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function removeAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
