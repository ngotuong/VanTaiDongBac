'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), details > summary:first-of-type, [href], [tabindex]:not([tabindex="-1"])';

export function useDialogFocusTrap<T extends HTMLElement>({ active, disabled = false, onClose }: { active: boolean; disabled?: boolean; onClose: () => void }) {
  const dialogRef = useRef<T>(null);
  const disabledRef = useRef(disabled);
  const closeRef = useRef(onClose);

  useEffect(() => {
    disabledRef.current = disabled;
    closeRef.current = onClose;
  }, [disabled, onClose]);

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((control) => control.getClientRects().length > 0 && !control.closest('[inert], [hidden], [aria-hidden="true"]'));
    if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
    (focusable()[0] || dialog).focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disabledRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
      previous?.focus();
    };
  }, [active]);

  return dialogRef;
}
