import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from '../next-shell/components/Dashboard.jsx';
const enabled = (value) => ['1','true','yes','on'].includes(String(value || '').trim().toLowerCase());
function mountReactDashboard() {
  if (!enabled(window.__REACT_DASHBOARD_ENABLED)) return false;
  const legacy = document.getElementById('dashboardLegacyRoot');
  const target = document.getElementById('dashboardReactRoot');
  if (!legacy || !target) return false;
  window.__REACT_DASHBOARD_ACTIVE = true;
  legacy.remove(); target.hidden = false;
  createRoot(target).render(<Dashboard bridge={{ exportCardAsImage: window.exportCardAsImage }}/>);
  queueMicrotask(() => window.renderDashboard?.());
  return true;
}
window.mountReactDashboard = mountReactDashboard;
mountReactDashboard();
