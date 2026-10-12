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
  const explicitTarget = button.dataset.exportTarget;
  const card = explicitTarget ? button.closest<HTMLElement>(explicitTarget) : button.closest<HTMLElement>('.table-card');
  if (!card) return showToast('Không tìm thấy nội dung để xuất ảnh.', 'error');
  button.disabled = true;
  let exportStage: HTMLElement | null = null;

  showToast('Đang tạo ảnh…', 'loading');
  try {
    const html2canvas = await loadHtml2Canvas();
    const contentWidth = measureExportContentWidth(card);
    const staged = createExportStage(card, contentWidth);
    exportStage = staged.stage;
    const exportCard = staged.card;

    await waitForExportLayout();
    freezeExportSelectControls(exportCard);
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
  copyLiveControlState(sourceCard, clonedCard);
  clonedCard.classList.add('is-exporting');
  clonedCard.dataset.exportCaptureRoot = 'true';
  clonedCard.style.setProperty('width', `${width}px`, 'important');
  normalizeExportLayout(clonedCard);
  stage.appendChild(clonedCard);
  document.body.appendChild(stage);
  return { stage, card: clonedCard };
}

function copyLiveControlState(sourceCard: HTMLElement, clonedCard: HTMLElement) {
  const sourceControls = Array.from(sourceCard.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'));
  const clonedControls = Array.from(clonedCard.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'));

  sourceControls.forEach((source, index) => {
    const clone = clonedControls[index];
    if (!clone || clone.tagName !== source.tagName) return;

    if (source instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
      clone.value = source.value;
      Array.from(clone.options).forEach((option, optionIndex) => {
        const selected = Boolean(source.options[optionIndex]?.selected);
        option.selected = selected;
        option.toggleAttribute('selected', selected);
      });
      clone.dataset.exportDisplayValue = source.selectedOptions[0]?.textContent?.trim() || source.value;
      return;
    }

    if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
      clone.value = source.value;
      clone.setAttribute('value', source.value);
      clone.checked = source.checked;
      clone.toggleAttribute('checked', source.checked);
      return;
    }

    if (source instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) {
      clone.value = source.value;
      clone.textContent = source.value;
    }
  });
}

function normalizeExportLayout(card: HTMLElement) {
  card.querySelectorAll<HTMLElement>('[data-export-hidden]').forEach((element) => element.remove());
  if (!card.classList.contains('payroll-explanation-modal')) {
    card.querySelectorAll<HTMLDetailsElement>('details').forEach((details) => { details.open = true; });
  }
  card.style.setProperty('max-height', 'none', 'important');
  card.style.setProperty('overflow', 'visible', 'important');
  card.style.setProperty('box-sizing', 'border-box', 'important');

  normalizeReportExportControls(card);

  card.querySelectorAll<HTMLElement>('.table-wrap, .report-module-table-wrap, .payroll-explanation-scroll, .payroll-explanation-table-wrap').forEach((wrap) => {
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

export function measureExportContentWidth(card: HTMLElement) {
  const cardRect = card.getBoundingClientRect();
  const tableWidths = Array.from(card.querySelectorAll<HTMLElement>('table')).map((table) => {
    const tableRect = table.getBoundingClientRect();
    const leftInset = Math.max(0, tableRect.left - cardRect.left);
    return Math.ceil(Math.max(table.scrollWidth, tableRect.width) + leftInset * 2);
  });
  return Math.max(720, card.scrollWidth, ...tableWidths);
}

function normalizeReportExportControls(card: HTMLElement) {
  card.querySelectorAll<HTMLElement>('.report-card-filters-mobile').forEach((filters) => filters.remove());
  card.querySelectorAll<HTMLElement>('.report-card-actions').forEach((actions) => actions.remove());

  card.querySelectorAll<HTMLElement>('.report-card-filters-desktop').forEach((filters) => {
    filters.style.setProperty('display', 'flex', 'important');
    filters.style.setProperty('align-items', 'center', 'important');
    filters.style.setProperty('justify-content', 'flex-end', 'important');
    filters.style.setProperty('gap', '8px', 'important');
    filters.style.setProperty('margin-left', 'auto', 'important');

    filters.querySelectorAll<HTMLElement>('.compact-filter').forEach((label) => {
      label.style.setProperty('display', 'flex', 'important');
      label.style.setProperty('align-items', 'center', 'important');
      label.style.setProperty('margin', '0', 'important');
    });
  });
}

function freezeExportSelectControls(card: HTMLElement) {
  card.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
    const rect = select.getBoundingClientRect();
    const computed = window.getComputedStyle(select);
    const replacement = document.createElement('div');
    replacement.className = 'export-static-select';
    replacement.textContent = select.dataset.exportDisplayValue || select.selectedOptions[0]?.textContent?.trim() || select.value;
    replacement.setAttribute('aria-hidden', 'true');
    Object.assign(replacement.style, {
      boxSizing: 'border-box',
      width: 'max-content',
      minWidth: `${Math.ceil(rect.width)}px`,
      maxWidth: 'none',
      height: `${Math.ceil(rect.height)}px`,
      minHeight: `${Math.ceil(rect.height)}px`,
      display: 'flex',
      flex: '0 0 auto',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 12px',
      border: computed.border,
      borderRadius: computed.borderRadius,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      backgroundImage: 'none',
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: 'normal',
      letterSpacing: computed.letterSpacing,
      whiteSpace: 'nowrap',
      overflow: 'visible',
      textOverflow: 'clip'
    });
    replacement.style.setProperty('color', computed.color || '#0f172a', 'important');
    replacement.style.setProperty('font-weight', computed.fontWeight || '700', 'important');
    replacement.style.setProperty('line-height', 'normal', 'important');
    select.replaceWith(replacement);
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
    .map((row) => Array.from(row.children).filter((cell) => !(cell as HTMLElement).matches('[data-export-hidden]')).map((cell) => {
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
