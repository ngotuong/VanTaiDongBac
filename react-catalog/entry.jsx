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
  window.__REACT_CATALOG_WRITE_ACTIVE = enabled(window.__REACT_CATALOG_WRITE_ENABLED);
  legacy.remove();
  target.hidden = false;
  createRoot(target).render(<CatalogReadOnly bridge={{
    setCatalogSheetTab: window.setCatalogSheetTab,
    debounceCatalogSearch: window.debounceCatalogSearch,
    filterCatalogRows: window.filterCatalogRows,
    changeCatalogPage: window.changeCatalogPage,
    openCatalogAddModal: window.openCatalogAddModal
  }} writeEnabled={window.__REACT_CATALOG_WRITE_ACTIVE}/>);
  queueMicrotask(() => window.loadCatalogSheetData?.(false));
  return true;
}
window.mountReactCatalogReadOnly = mountReactCatalogReadOnly;
mountReactCatalogReadOnly();
