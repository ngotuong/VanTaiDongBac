'use client';

type Html2Canvas = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

declare global {
  interface Window { html2canvas?: Html2Canvas; }
}

let loader: Promise<Html2Canvas> | null = null;

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js';
    script.async = true;
    script.onload = () => window.html2canvas ? resolve(window.html2canvas) : reject(new Error('Không khởi tạo được trình xuất ảnh.'));
    script.onerror = () => reject(new Error('Không tải được trình xuất ảnh.'));
    document.head.appendChild(script);
  });
  return loader;
}

export async function exportCardAsImage(card: HTMLElement | null, fileType: string) {
  if (!card) throw new Error('Không tìm thấy nội dung cần xuất.');
  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(card, {
    backgroundColor: '#ffffff', scale: Math.min(window.devicePixelRatio || 1, 2), useCORS: true,
    logging: false, scrollX: 0, scrollY: -window.scrollY
  });
  const link = document.createElement('a');
  link.download = `${fileType}_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function ImageExportIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
}
