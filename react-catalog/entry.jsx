import React from 'react';
import { createRoot } from 'react-dom/client';
import CatalogReadOnly from '../next-shell/components/CatalogReadOnly.jsx';

const enabled = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
function mountReactCatalogReadOnly() {
  if (!enabled(window.__REACT_CATALOG_READONLY_ENABLED)) return false;
  const legacy = document.getElementById('catalogLegacyRoot');
  const target = document.getElementById('catalogReactRoot');
  if (!legacy || !target) return false;
  window.__REACT_CATALOG_READONLY_ACTIVE = true;
  legacy.remove();
  target.hidden = false;
  createRoot(target).render(<CatalogReadOnly bridge={{ setCatalogSheetTab: window.setCatalogSheetTab }}/>);
  queueMicrotask(() => window.loadCatalogSheetData?.(false));
  return true;
}
window.mountReactCatalogReadOnly = mountReactCatalogReadOnly;
mountReactCatalogReadOnly();
