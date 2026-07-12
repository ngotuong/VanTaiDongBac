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
  const call = (name, ...args) => bridge && typeof bridge[name] === 'function' ? bridge[name](...args) : undefined;
  return <div data-react-catalog-readonly="true">
    <div className="sub-tabs-bar app-sticky-tabs" id="catalogTabsBar" style={{ width: '100%', marginBottom: 12 }}>
      {sheets.map(([sheetName, label], index) => <button type="button" className={`sub-tab${index === 0 ? ' active' : ''}`} data-sheet={sheetName} onClick={() => selectSheet(sheetName)} key={sheetName}>{label}</button>)}
    </div>
    <input type="hidden" id="catalogSheetSelect" defaultValue="DM_NhanSu"/>
    <div className="filter-bar catalog-sticky-toolbar app-sticky-toolbar sticky-after-tabs catalog-react-filters">
      <div className="filter-container catalog-react-filter-container">
        <label className="catalog-search-control">Tìm kiếm:<input type="text" id="catalogSearchInput" placeholder="Tìm kiếm trong danh mục..." onInput={() => call('debounceCatalogSearch')}/></label>
        <label id="catalogPersonnelStatusFilterWrap" className="catalog-compact-filter" style={{ display: 'none' }}><select id="catalogPersonnelStatusFilter" defaultValue="active" onChange={() => call('filterCatalogRows')}><option value="active">Đang làm</option><option value="inactive">Đã nghỉ</option><option value="all">Tất cả</option></select></label>
        <label id="catalogVehicleOwnerFilterWrap" className="catalog-compact-filter" style={{ display: 'none' }}><select id="catalogVehicleOwnerFilter" aria-label="Lọc công ty xe" defaultValue="" onChange={() => call('filterCatalogRows')}><option value="">Tất cả</option></select></label>
      </div>
    </div>
    <div className="table-card">
      <div className="table-scroll catalog-readonly-scroll"><table className="report-table mobile-record-table" id="catalogTable"><thead><tr id="catalogTableHeader"></tr></thead><tbody id="catalogTableBody"></tbody></table></div>
      <div id="catalogTableEmpty" className="panel-body catalog-readonly-empty" style={{ display: 'none' }}>Không có dữ liệu phù hợp với tìm kiếm của bạn.</div>
      <div id="catalogPaginationBar" className="catalog-react-pagination" style={{ display: 'none' }}><span id="catalogPaginationInfo">Đang hiển thị 0-0 trên 0</span><div className="catalog-react-page-actions"><button type="button" className="secondary" id="catalogPrevPageBtn" onClick={() => call('changeCatalogPage', -1)}>← Trước</button><button type="button" className="secondary" id="catalogNextPageBtn" onClick={() => call('changeCatalogPage', 1)}>Sau →</button></div></div>
    </div>
  </div>;
}

export { sheets as catalogSheets };
