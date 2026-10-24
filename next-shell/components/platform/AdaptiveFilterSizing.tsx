'use client';

import { useLayoutEffect } from 'react';

const FILTER_SELECTOR = 'select.platform-content-select:not([data-fixed-filter-width])';
const FILTER_INLINE_PADDING = '0px 30px 0px 10px';

function numericStyle(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function selectedLabel(select: HTMLSelectElement) {
  return select.options[select.selectedIndex]?.textContent?.trim() || select.value || '';
}

export function AdaptiveFilterSizing() {
  useLayoutEffect(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    let frame = 0;

    const measure = (select: HTMLSelectElement) => {
      select.dataset.adaptiveFilter = 'selected';
      // Keep the shared filter contract above module-level legacy selectors.
      // Inline !important is intentional here: several migrated surfaces still
      // ship highly-specific width and padding rules in their golden CSS.
      select.style.setProperty('min-width', '0px', 'important');
      select.style.setProperty('max-width', '100%', 'important');
      select.style.setProperty('padding', FILTER_INLINE_PADDING, 'important');
      select.style.setProperty('background-position', 'right 8px center', 'important');
      select.style.setProperty('background-size', '15px 15px', 'important');
      select.style.setProperty('font-weight', '500', 'important');
      select.style.setProperty('text-align', 'left', 'important');
      select.style.setProperty('text-align-last', 'left', 'important');
      const style = window.getComputedStyle(select);
      if (context) {
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      }
      const textWidth = context?.measureText(selectedLabel(select)).width || selectedLabel(select).length * numericStyle(style.fontSize) * 0.56;
      const chromeWidth = numericStyle(style.paddingLeft)
        + numericStyle(style.paddingRight)
        + numericStyle(style.borderLeftWidth)
        + numericStyle(style.borderRightWidth);
      const selectedWidth = `${Math.ceil(textWidth + chromeWidth + 2)}px`;
      select.style.setProperty('--platform-filter-selected-width', selectedWidth);
      select.style.setProperty('width', selectedWidth, 'important');
    };

    const measureAll = () => {
      frame = 0;
      document.querySelectorAll<HTMLSelectElement>(FILTER_SELECTOR).forEach(measure);
    };
    const schedule = () => {
      // Do not restart the frame on every data-render mutation. Repeated
      // cancellations can starve newly mounted tab and drawer filters.
      if (frame) return;
      frame = window.requestAnimationFrame(measureAll);
    };
    const onChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.matches(FILTER_SELECTOR)) measure(target);
    };
    const observer = new MutationObserver(schedule);
    // Drawers are rendered through body-level portals, so the shared observer
    // must cover both route content and filters mounted inside overlays.
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', onChange);
    window.addEventListener('resize', schedule, { passive: true });
    void document.fonts?.ready.then(schedule);
    measureAll();

    return () => {
      observer.disconnect();
      document.removeEventListener('change', onChange);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
