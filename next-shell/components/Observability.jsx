'use client';
import React from 'react';

const Icon = ({ children }) => <svg className="btn-svg" viewBox="0 0 24 24">{children}</svg>;

export default function Observability({ bridge }) {
  const call = (name, ...args) => bridge && typeof bridge[name] === 'function' ? bridge[name](...args) : undefined;
  return <article className="info-card sync-status-card" data-hide-shareholder="true" style={{ gridColumn: '1 / -1' }}>
    <div className="settings-card-header">
      <div><h2>Trạng thái đồng bộ</h2><p id="syncStatusCheckedAt">Theo dõi cache và write queue. Audit chỉ chạy khi bấm kiểm tra.</p></div>
      <div className="sync-status-actions">
        <button type="button" className="ghost icon-text-btn" id="syncStatusRefreshBtn" onClick={() => call('loadSupabaseSyncStatus', true)} title="Tải lại trạng thái đồng bộ nhanh"><Icon><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></Icon>Làm mới</button>
        <button type="button" className="ghost icon-text-btn" id="manageAuditBtn" onClick={() => call('runManageCacheAudit', false)} title="So cache Vận hành với Google Sheet"><Icon><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Icon>Kiểm tra Vận hành</button>
        <button type="button" className="ghost icon-text-btn" id="manageDeepAuditBtn" onClick={() => call('runManageCacheAudit', false, true)} title="So sâu 500 dòng cache Vận hành với Google Sheet"><Icon><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></Icon>Kiểm tra sâu</button>
        <button type="button" className="ghost icon-text-btn" id="manageAllAuditBtn" onClick={() => call('runManageCacheAudit', true, true)} title="So sâu 500 dòng của toàn bộ sheet Vận hành"><Icon><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></Icon>Kiểm tra tất cả</button>
        <button type="button" className="ghost icon-text-btn" id="reportAuditBtn" onClick={() => call('runReportCacheAudit')} title="So cache Báo cáo với Google Sheet"><Icon><path d="M3 3v18h18"/><path d="M19 9l-5 5-4-4-3 3"/></Icon>Kiểm tra Báo cáo</button>
      </div>
    </div>
    <div id="syncStatusBody" className="sync-status-list"><div className="sync-status-empty">Chọn Cài đặt để tải trạng thái.</div></div>
  </article>;
}
