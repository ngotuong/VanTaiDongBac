import { showToast } from './toast';

type Html2Canvas = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

let html2CanvasLoader: Promise<Html2Canvas> | null = null;
const EXPORT_BOTTOM_GUARD = 24;

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
  if (!card) return showToast('Không tìm thấy nội dung để xuất ảnh.', 'error');
  button.disabled = true;
  let exportStage: HTMLElement | null = null;

  showToast('Đang tạo ảnh…', 'loading');
  try {
    const html2canvas = await loadHtml2Canvas();
    const table = card.querySelector<HTMLElement>('table');
    const tableWidth = table ? table.scrollWidth : card.scrollWidth;
    const contentWidth = Math.max(720, tableWidth);
    const staged = createExportStage(card, contentWidth);
    exportStage = staged.stage;
    const exportCard = staged.card;

    await waitForExportLayout();
    stripExportCurrencyUnits(exportCard);

    const exportTable = exportCard.querySelector<HTMLElement>('table');
    const headElem = exportCard.querySelector<HTMLElement>('.table-card-head');
    const headHeight = headElem ? Math.max(headElem.offsetHeight, headElem.getBoundingClientRect().height) : 50;
    const tableHeight = exportTable ? Math.max(exportTable.offsetHeight, exportTable.scrollHeight, exportTable.getBoundingClientRect().height) : 0;
    const legendElem = exportCard.querySelector<HTMLElement>('.financial-donut, .donut-chart-wrapper');
    const legendHeight = legendElem ? legendElem.scrollHeight : 0;

    const autoMeasuredHeight = Math.ceil(headHeight + tableHeight + legendHeight);
    const measuredHeight = Math.max(exportCard.scrollHeight, exportCard.offsetHeight, autoMeasuredHeight);
    const fullHeight = exportCaptureHeight(measuredHeight);

    exportCard.style.setProperty('height', `${fullHeight}px`, 'important');
    exportCard.style.setProperty('min-height', `${fullHeight}px`, 'important');

    await waitForExportLayout();

    const canvas = await html2canvas(exportCard, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc: Document) => {
        const clonedCard = clonedDoc.querySelector<HTMLElement>('[data-export-capture-root="true"]');
        if (clonedCard) {
          normalizeExportLayout(clonedCard);
          clonedCard.style.setProperty('height', `${fullHeight}px`, 'important');
          clonedCard.style.setProperty('min-height', `${fullHeight}px`, 'important');
        }
      }
    });
    const link = document.createElement('a');
    link.download = `${title}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('Đã tạo và tải ảnh xuống.', 'success');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Không thể xuất ảnh.', 'error');
  } finally {
    exportStage?.remove();
    button.disabled = false;
  }
}

function createExportStage(sourceCard: HTMLElement, width: number) {
  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  Object.assign(stage.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${width}px`,
    pointerEvents: 'none',
    zIndex: '-1'
  });

  const clonedCard = sourceCard.cloneNode(true) as HTMLElement;
  clonedCard.classList.add('is-exporting');
  clonedCard.dataset.exportCaptureRoot = 'true';
  clonedCard.style.setProperty('width', `${width}px`, 'important');
  normalizeExportLayout(clonedCard);
  stage.appendChild(clonedCard);
  document.body.appendChild(stage);
  return { stage, card: clonedCard };
}

function normalizeExportLayout(card: HTMLElement) {
  card.style.setProperty('max-height', 'none', 'important');
  card.style.setProperty('overflow', 'visible', 'important');
  card.style.setProperty('box-sizing', 'border-box', 'important');

  card.querySelectorAll<HTMLElement>('.table-wrap, .report-module-table-wrap').forEach((wrap) => {
    wrap.scrollLeft = 0;
    wrap.scrollTop = 0;
    wrap.style.setProperty('max-height', 'none', 'important');
    wrap.style.setProperty('height', 'auto', 'important');
    wrap.style.setProperty('overflow', 'visible', 'important');
    wrap.style.setProperty('box-shadow', 'none', 'important');
    wrap.style.setProperty('scrollbar-gutter', 'auto', 'important');
  });

  card.querySelectorAll<HTMLElement>('table thead, table tbody, table tfoot, table tr, table th, table td, .sticky-col, .sticky-col-right, .sticky-total-foot').forEach((elem) => {
    elem.style.setProperty('position', 'static', 'important');
    elem.style.setProperty('inset', 'auto', 'important');
    elem.style.setProperty('top', 'auto', 'important');
    elem.style.setProperty('right', 'auto', 'important');
    elem.style.setProperty('bottom', 'auto', 'important');
    elem.style.setProperty('left', 'auto', 'important');
    elem.style.setProperty('z-index', 'auto', 'important');
    elem.style.setProperty('transform', 'none', 'important');
    elem.style.setProperty('filter', 'none', 'important');
    elem.style.setProperty('box-shadow', 'none', 'important');
  });
}

export function exportCaptureHeight(...measurements: number[]) {
  return Math.ceil(Math.max(0, ...measurements)) + EXPORT_BOTTOM_GUARD;
}

function waitForExportLayout() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function stripExportCurrencyUnits(card: HTMLElement) {
  return Array.from(card.querySelectorAll<HTMLElement>('td'))
    .filter((cell) => /^\s*[+-]?\s*\d[\d.,\s]*\s*(?:₫|đ)\s*$/i.test(String(cell.textContent || '')))
    .map((cell) => {
      cell.textContent = String(cell.textContent || '').replace(/\s*(?:₫|đ)\s*$/i, '');
      return cell;
    });
}

export function exportTableAsCsv(button: HTMLButtonElement, fallbackTitle: string) {
  const card = button.closest<HTMLElement>('.table-card');
  const table = card?.querySelector('table');
  if (!table) return showToast('Không tìm thấy bảng để xuất.', 'error');
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
  showToast('Đã tạo và tải bảng dữ liệu xuống.', 'success');
}

function removeAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
