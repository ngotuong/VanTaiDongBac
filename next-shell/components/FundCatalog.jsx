'use client';
import React from 'react';

const groups = [['incomeCategories','Mục Thu'],['expenseCategories','Mục Chi'],['actors','Người Thu/Chi'],['partners','Đối tác'],['loanPartners','Nơi vay']];
export default function FundCatalog({ bridge }) {
  const call = (name, ...args) => bridge && typeof bridge[name] === 'function' ? bridge[name](...args) : undefined;
  return <div className="table-card fund-catalog-card" data-cashflow-panel="catalog" data-write-only="true">
    <div className="panel-body">
      <div className="fund-catalog-head"><div><div className="table-title" id="fundCatalogTitle">Danh mục quỹ</div><div className="panel-note" id="fundCatalogNote">Quản lý danh mục dùng chung cho module Quỹ.</div></div><div className="fund-catalog-chips">{groups.map(([key,label],index)=><button type="button" className={`fund-chip${index===0?' active':''}`} data-fund-catalog-group={key} onClick={()=>call('setFundCatalogGroup',key)} key={key}>{label}</button>)}</div></div>
      <div id="fundCatalogStatus" className="status" style={{display:'none'}}></div>
      <div className="fund-catalog-form"><label>Giá trị<input type="text" id="fundCatalogValueInput" placeholder="Nhập danh mục"/></label><button type="button" className="primary" id="fundCatalogSaveBtn" onClick={()=>call('saveFundCatalogItem')}><svg className="btn-svg" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Lưu danh mục</button><button type="button" className="ghost" onClick={()=>call('clearFundCatalogForm')}>Xóa nhập</button></div>
      <div className="table-wrap"><table className="report-table fund-catalog-table"><thead><tr><th>STT</th><th>Giá trị</th><th>Thao tác</th></tr></thead><tbody id="fundCatalogTableBody"><tr><td colSpan={3} className="fund-catalog-empty">Chọn một nhóm danh mục để tải dữ liệu.</td></tr></tbody></table></div>
    </div>
  </div>;
}
export { groups as fundCatalogGroups };
