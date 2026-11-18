import { showToast } from './toast';

type Html2Canvas = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

let html2CanvasLoader: Promise<Html2Canvas> | null = null;
const EXPORT_BOTTOM_GUARD = 24;
const EXPORT_RIGHT_GUARD = 2;
const EXPORT_OBJECT_URL_LIFETIME_MS = 60_000;
const EXPORT_TARGET_SCALE = 2;
const EXPORT_MIN_READABLE_SCALE = 0.75;
const EXPORT_MIN_RETRY_SCALE = 0.35;
const EXPORT_MAX_CANVAS_PIXELS = 20_000_000;
const EXPORT_MAX_CANVAS_DIMENSION = 16_384;
const EXPORT_DATA_URL_FALLBACK_MAX_PIXELS = 8_000_000;
const EXPORT_WIDTH_GROWTH_RATIO = 1.25;
const EXPORT_WIDTH_GROWTH_PX = 256;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export class CanvasPngEncodingError extends Error {
  readonly code = 'CANVAS_PNG_ENCODING_FAILED';
}

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

    const captureWidth = await settleExportWidth(staged.stage, exportCard, contentWidth);

    const exportTable = exportCard.querySelector<HTMLElement>('table');
    const fullHeight = measureExportCardHeight(exportCard);

    exportCard.style.setProperty('height', `${fullHeight}px`, 'important');
    exportCard.style.setProperty('min-height', `${fullHeight}px`, 'important');

    await waitForExportLayout();
    const bodyRows = exportTable ? Array.from(exportTable.querySelectorAll<HTMLElement>('tbody > tr')) : [];
    const plan = planExportRaster(captureWidth, fullHeight, bodyRows.length > 1);
    const rowHeights = plan.split ? bodyRows.map((row) => Math.max(row.offsetHeight, row.getBoundingClientRect().height)) : [];
    const fixedHeight = plan.split ? Math.max(0, fullHeight - rowHeights.reduce((sum, height) => sum + height, 0)) : 0;
    const rowGroups = plan.split
      ? partitionExportRowHeights(rowHeights, Math.max(1, plan.maxPartCssHeight - fixedHeight - EXPORT_BOTTOM_GUARD))
      : [];
    const shouldSplit = Boolean(exportTable && rowGroups.length > 1);
    const dateSuffix = new Date().toISOString().slice(0, 10);

    if (!shouldSplit) {
      const singleScale = calculateSafeExportScale(captureWidth, fullHeight);
      const png = await renderExportPng(html2canvas, exportCard, captureWidth, fullHeight, singleScale);
      downloadPngBlob(png, `${title}-${dateSuffix}.png`);
      showToast(singleScale < EXPORT_TARGET_SCALE
        ? 'Đã tạo ảnh đầy đủ ở độ phân giải phù hợp với kích thước bảng.'
        : 'Đã tạo và tải ảnh xuống.', 'success');
    } else {
      for (let partIndex = 0; partIndex < rowGroups.length; partIndex += 1) {
        const [start, end] = rowGroups[partIndex];
        bodyRows.forEach((row, rowIndex) => {
          row.style.setProperty('display', rowIndex >= start && rowIndex < end ? 'table-row' : 'none', 'important');
        });
        exportCard.style.setProperty('height', 'auto', 'important');
        exportCard.style.setProperty('min-height', '0', 'important');
        await waitForExportLayout();
        const partHeight = measureExportCardHeight(exportCard);
        exportCard.style.setProperty('height', `${partHeight}px`, 'important');
        exportCard.style.setProperty('min-height', `${partHeight}px`, 'important');
        await waitForExportLayout();

        const partScale = calculateSafeExportScale(captureWidth, partHeight, plan.scale);
        const png = await renderExportPng(html2canvas, exportCard, captureWidth, partHeight, partScale);
        downloadPngBlob(png, `${title}-${dateSuffix}-phan-${partIndex + 1}-tren-${rowGroups.length}.png`);
        if (partIndex + 1 < rowGroups.length) await waitForDownloadTurn();
      }
      showToast(`Bảng quá dài nên đã được chia thành ${rowGroups.length} ảnh đầy đủ.`, 'success');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Không thể xuất ảnh.', 'error');
  } finally {
    exportStage?.remove();
    button.disabled = false;
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement) {
  if (!Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) || canvas.width <= 0 || canvas.height <= 0) {
    return Promise.reject(new Error('Ảnh xuất không có kích thước hợp lệ.'));
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      const encoded = blob && blob.size > 0
        ? Promise.resolve(blob)
        : canvas.width * canvas.height <= EXPORT_DATA_URL_FALLBACK_MAX_PIXELS
          ? canvasToPngFallback(canvas)
          : Promise.reject(new CanvasPngEncodingError('Ảnh quá lớn để trình duyệt mã hóa PNG.'));
      encoded.then(normalizePngBlob).then(resolve, reject);
    }, 'image/png');
  });
}

async function canvasToPngFallback(canvas: HTMLCanvasElement) {
  const dataUrl = canvas.toDataURL('image/png');
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) {
    throw new CanvasPngEncodingError('Trình duyệt không thể mã hóa ảnh PNG. Vui lòng thử lại.');
  }

  const binary = atob(dataUrl.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'image/png' });
}

async function normalizePngBlob(blob: Blob) {
  const signature = new Uint8Array(await blob.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  const isPng = signature.length === PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((byte, index) => signature[index] === byte);

  if (!isPng) {
    throw new Error('Dữ liệu ảnh được tạo ra không phải tệp PNG hợp lệ. Vui lòng thử lại.');
  }

  return blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
}

export function downloadPngBlob(blob: Blob, filename: string) {
  if (blob.size <= 0 || blob.type !== 'image/png') {
    throw new Error('Không thể tải tệp ảnh trống.');
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = objectUrl;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }, EXPORT_OBJECT_URL_LIFETIME_MS);
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

export function measureRenderedExportWidth(card: HTMLElement) {
  const cardRect = card.getBoundingClientRect();
  const computed = window.getComputedStyle(card);
  const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(computed.borderRightWidth) || 0;
  const paddingRight = Number.parseFloat(computed.paddingRight) || 0;
  const currentWidth = Math.max(cardRect.width, card.offsetWidth);
  const scrollOuterWidth = card.scrollWidth + borderLeft + borderRight;
  const descendantRight = Array.from(card.querySelectorAll<HTMLElement>('*')).reduce((right, element) => {
    const rect = element.getBoundingClientRect();
    return Math.max(right, rect.right - cardRect.left);
  }, 0);
  const descendantOuterWidth = descendantRight + paddingRight + borderRight;
  const requiredWidth = Math.max(currentWidth, scrollOuterWidth, descendantOuterWidth);
  return requiredWidth > currentWidth + 0.5
    ? Math.ceil(requiredWidth) + EXPORT_RIGHT_GUARD
    : Math.ceil(currentWidth);
}

export function constrainMeasuredExportWidth(measuredWidth: number, naturalWidth: number) {
  const safeNaturalWidth = Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : 720;
  const ceiling = Math.ceil(Math.max(
    safeNaturalWidth + EXPORT_WIDTH_GROWTH_PX,
    safeNaturalWidth * EXPORT_WIDTH_GROWTH_RATIO
  ));
  const safeMeasuredWidth = Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : safeNaturalWidth;
  return Math.ceil(Math.min(Math.max(safeNaturalWidth, safeMeasuredWidth), ceiling));
}

async function settleExportWidth(stage: HTMLElement, card: HTMLElement, naturalWidth: number) {
  let width = constrainMeasuredExportWidth(measureRenderedExportWidth(card), naturalWidth);
  for (let pass = 0; pass < 2; pass += 1) {
    stage.style.setProperty('width', `${width}px`);
    card.style.setProperty('width', `${width}px`, 'important');
    await waitForExportLayout();
    const nextWidth = constrainMeasuredExportWidth(measureRenderedExportWidth(card), naturalWidth);
    if (nextWidth <= width) break;
    width = nextWidth;
  }
  stage.style.setProperty('width', `${width}px`);
  card.style.setProperty('width', `${width}px`, 'important');
  await waitForExportLayout();
  return width;
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

export function calculateSafeExportScale(width: number, height: number, targetScale = EXPORT_TARGET_SCALE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  return Math.max(0.1, Math.min(
    targetScale,
    EXPORT_MAX_CANVAS_DIMENSION / width,
    EXPORT_MAX_CANVAS_DIMENSION / height,
    Math.sqrt(EXPORT_MAX_CANVAS_PIXELS / (width * height))
  ));
}

export function planExportRaster(width: number, height: number, canSplitRows: boolean) {
  const singleScale = calculateSafeExportScale(width, height);
  const widthScaleLimit = Math.min(EXPORT_TARGET_SCALE, EXPORT_MAX_CANVAS_DIMENSION / Math.max(1, width));
  if (singleScale >= EXPORT_MIN_READABLE_SCALE || !canSplitRows || widthScaleLimit < EXPORT_MIN_READABLE_SCALE) {
    return { split: false, scale: singleScale, maxPartCssHeight: height };
  }

  const partScale = Math.max(0.1, Math.min(1, widthScaleLimit));
  const maxPartCssHeight = Math.max(1, Math.floor(Math.min(
    EXPORT_MAX_CANVAS_DIMENSION / partScale,
    EXPORT_MAX_CANVAS_PIXELS / (width * partScale * partScale)
  )));
  if (height <= maxPartCssHeight) {
    return { split: false, scale: singleScale, maxPartCssHeight: height };
  }
  return { split: true, scale: partScale, maxPartCssHeight };
}

export function partitionExportRowHeights(rowHeights: number[], maxHeight: number) {
  if (!rowHeights.length) return [];
  const groups: Array<[number, number]> = [];
  let start = 0;
  let height = 0;
  rowHeights.forEach((rawHeight, index) => {
    const rowHeight = Math.max(1, Number.isFinite(rawHeight) ? rawHeight : 1);
    if (index > start && height + rowHeight > maxHeight) {
      groups.push([start, index]);
      start = index;
      height = 0;
    }
    height += rowHeight;
  });
  groups.push([start, rowHeights.length]);
  return groups;
}

function measureExportCardHeight(card: HTMLElement) {
  const table = card.querySelector<HTMLElement>('table');
  const head = card.querySelector<HTMLElement>('.table-card-head');
  const legend = card.querySelector<HTMLElement>('.financial-donut, .donut-chart-wrapper');
  const headHeight = head ? Math.max(head.offsetHeight, head.getBoundingClientRect().height) : 50;
  const tableHeight = table ? Math.max(table.offsetHeight, table.scrollHeight, table.getBoundingClientRect().height) : 0;
  const legendHeight = legend ? legend.scrollHeight : 0;
  return exportCaptureHeight(Math.max(card.scrollHeight, card.offsetHeight, Math.ceil(headHeight + tableHeight + legendHeight)));
}

async function renderExportPng(html2canvas: Html2Canvas, card: HTMLElement, width: number, height: number, requestedScale: number) {
  let scale = requestedScale;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const canvas = await html2canvas(card, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: true,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc: Document) => {
        const clonedCard = clonedDoc.querySelector<HTMLElement>('[data-export-capture-root="true"]');
        if (clonedCard) {
          normalizeExportLayout(clonedCard);
          clonedCard.style.setProperty('width', `${width}px`, 'important');
          clonedCard.style.setProperty('height', `${height}px`, 'important');
          clonedCard.style.setProperty('min-height', `${height}px`, 'important');
        }
      }
    });
    try {
      return await canvasToPngBlob(canvas);
    } catch (error) {
      lastError = error;
      if (!(error instanceof CanvasPngEncodingError) || scale <= EXPORT_MIN_RETRY_SCALE) throw error;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
    scale = Math.max(EXPORT_MIN_RETRY_SCALE, scale * 0.75);
  }
  throw lastError instanceof Error ? lastError : new CanvasPngEncodingError('Trình duyệt không thể mã hóa ảnh PNG.');
}

function waitForDownloadTurn() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 160));
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
