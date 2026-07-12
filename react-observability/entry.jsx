import React from 'react';
import { createRoot } from 'react-dom/client';
import Observability from '../next-shell/components/Observability.jsx';

const enabled = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
function mountReactObservability() {
  if (!enabled(window.__REACT_OBSERVABILITY_ENABLED)) return false;
  const legacy = document.getElementById('observabilityLegacyRoot');
  const target = document.getElementById('observabilityReactRoot');
  if (!legacy || !target) return false;
  const bridge = {
    loadSupabaseSyncStatus: window.loadSupabaseSyncStatus,
    runManageCacheAudit: window.runManageCacheAudit,
    runReportCacheAudit: window.runReportCacheAudit
  };
  legacy.remove();
  target.hidden = false;
  createRoot(target).render(<Observability bridge={bridge}/>);
  return true;
}
window.mountReactObservability = mountReactObservability;
mountReactObservability();
