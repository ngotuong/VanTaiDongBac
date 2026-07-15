export type ToastKind = 'info' | 'success' | 'error' | 'loading';

export type ToastDetail = {
  id: number;
  message: string;
  kind: ToastKind;
  duration: number;
};

let toastId = 0;

export function showToast(message: string, kind: ToastKind = 'info', duration = kind === 'loading' ? 10000 : 3600) {
  if (typeof window === 'undefined' || !message.trim()) return;
  window.dispatchEvent(new CustomEvent<ToastDetail>('vtdb:toast', {
    detail: { id: ++toastId, message: message.trim(), kind, duration }
  }));
}
