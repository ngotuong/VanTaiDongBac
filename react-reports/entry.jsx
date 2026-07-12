import React from 'react';
import { createRoot } from 'react-dom/client';
import Reports from '../next-shell/components/Reports.jsx';
const enabled = (value) => ['1','true','yes','on'].includes(String(value || '').trim().toLowerCase());
function mountReactReports() {
  if (!enabled(window.__REACT_REPORTS_ENABLED)) return false;
  const legacy = document.getElementById('reportsLegacyRoot');
  const target = document.getElementById('reportsReactRoot');
  if (!legacy || !target) return false;
  window.__REACT_REPORTS_ACTIVE = true;
  legacy.remove(); target.hidden = false;
  createRoot(target).render(<Reports bridge={{ setReportTab: window.setReportTab, debounceReportSearch: window.debounceReportSearch }}/>);
  queueMicrotask(() => window.renderReports?.());
  return true;
}
window.mountReactReports = mountReactReports;
mountReactReports();
