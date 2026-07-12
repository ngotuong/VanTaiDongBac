'use client';
import React from 'react';

const sheets = [
  ['DM_NhanSu', 'Nhân sự'], ['DM_Xe', 'Danh sách xe'], ['DM_DuAn', 'Dự án & Cự ly'],
  ['DM_LuongChuyen', 'Lương chuyến xe'], ['DM_ThamSo_TS', 'Tham số hệ thống'],
  ['DM_ThamSo_GD', 'Lịch sử giá dầu'], ['DM_DonGiaVanChuyen', 'Đơn giá vận chuyển'],
  ['DM_ThuongQuanLy', 'Thưởng quản lý'], ['DM_PhatNoiBo', 'Quy định phạt']
];

export default function CatalogReadOnly({ bridge }) {
  const selectSheet = (sheetName) => bridge && typeof bridge.setCatalogSheetTab === 'function' && bridge.setCatalogSheetTab(sheetName);
  return <div data-react-catalog-readonly="true">
    <div className="sub-tabs-bar app-sticky-tabs" id="catalogTabsBar" style={{ width: '100%', marginBottom: 12 }}>
      {sheets.map(([sheetName, label], index) => <button type="button" className={`sub-tab${index === 0 ? ' active' : ''}`} data-sheet={sheetName} onClick={() => selectSheet(sheetName)} key={sheetName}>{label}</button>)}
    </div>
    <input type="hidden" id="catalogSheetSelect" defaultValue="DM_NhanSu"/>
    <div hidden aria-hidden="true">
      <input id="catalogSearchInput" defaultValue=""/>
      <span id="catalogPersonnelStatusFilterWrap"><select id="catalogPersonnelStatusFilter" defaultValue="active"><option value="active">Đang làm</option><option value="inactive">Đã nghỉ</option><option value="all">Tất cả</option></select></span>
      <span id="catalogVehicleOwnerFilterWrap"><select id="catalogVehicleOwnerFilter" defaultValue=""><option value="">Tất cả</option></select></span>
    </div>
    <div className="table-card">
      <div className="table-scroll catalog-readonly-scroll"><table className="report-table mobile-record-table" id="catalogTable"><thead><tr id="catalogTableHeader"></tr></thead><tbody id="catalogTableBody"></tbody></table></div>
      <div id="catalogTableEmpty" className="panel-body catalog-readonly-empty" style={{ display: 'none' }}>Không có dữ liệu phù hợp với tìm kiếm của bạn.</div>
      <div id="catalogPaginationBar" hidden><span id="catalogPaginationInfo">Đang hiển thị 0-0 trên 0</span><button type="button" id="catalogPrevPageBtn"/><button type="button" id="catalogNextPageBtn"/></div>
    </div>
  </div>;
}

export { sheets as catalogSheets };
