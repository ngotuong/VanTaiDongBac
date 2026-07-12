'use client';
import React from 'react';
const tabs = [['all','Tất Cả'],['finance','Tổng Quan'],['details','Chi Tiết'],['payroll','Bảng Lương'],['vehicles','Tổng Hợp Xe']];
export default function Reports({ bridge }) {
  return <div data-react-reports="true">
    <div className="sub-tabs-bar app-sticky-tabs" id="reportTabsBar">{tabs.map(([type,label], index) => <button type="button" className={`sub-tab${index === 0 ? ' active' : ''}`} data-report-tab={type} onClick={() => bridge?.setReportTab?.(type)} key={type}>{label}</button>)}</div>
    <section className="panel report-filter-panel app-sticky-toolbar sticky-after-tabs" style={{marginBottom:16}}><div className="panel-head reports-filter-head"><div className="filter-row reports-filter-row"><input type="text" id="reportSearchInput" placeholder="Tìm xe, tài xế..." onInput={() => bridge?.debounceReportSearch?.()}/><select id="reportMonthFilter" aria-label="Chọn tháng báo cáo"/></div></div></section>
    <div className="report-stack" id="reports"><div className="table-card"><div className="panel-body"><div className="shimmer shimmer-table"/></div></div><div className="table-card"><div className="panel-body"><div className="shimmer shimmer-table"/></div></div></div>
  </div>;
}
