'use client';
import React from 'react';

const shimmerCards = Array.from({ length: 5 });
export default function Dashboard({ bridge }) {
  const exportImage = (event, name) => bridge?.exportCardAsImage?.(event.currentTarget, name);
  return <div data-react-dashboard="true">
    <div className="panel dashboard-month-filter">
      <div id="homeFilterTitle" className="dashboard-month-title">Tháng</div>
      <select id="homeMonthFilter" aria-label="Chọn tháng tổng quan" />
    </div>
    <div className="kpi-grid" id="metrics">{shimmerCards.map((_, index) => <article className="kpi-card" key={index}><div className="shimmer shimmer-text"/><div className="shimmer shimmer-value"/></article>)}</div>
    <section className="panel" style={{ marginBottom: 24 }}><div className="panel-head"><div><h2 className="panel-title">Biểu đồ lợi nhuận thực tế</h2><div className="panel-note" id="chartNote">Dữ liệu được cập nhật tự động từ BC_TongQuan</div></div></div><div className="panel-body"><div className="chart" id="profitChart"><div className="shimmer shimmer-chart"/></div></div></section>
    <section className="panel table-card" id="homeLatestTripsCard" style={{ marginBottom: 24 }}><div className="table-card-head"><div className="table-title">Dữ liệu chuyến gần đây <span id="latestTripsDate" className="dashboard-latest-date"/></div><button type="button" className="sub-tab dashboard-export" title="Xuất ảnh" aria-label="Xuất ảnh dữ liệu chuyến gần đây" onClick={(event) => exportImage(event, 'SoChuyenXe')}>Ảnh</button></div><div className="table-wrap"><table id="homeLatestTripsTable"><thead><tr><th style={{width:'28%'}}>Dự án</th><th style={{width:'26%'}}>Biển số xe</th><th style={{width:'20%'}}>Số chuyến chạy</th><th style={{width:'26%'}}>Số phiếu</th></tr></thead><tbody><tr><td colSpan="4" className="dashboard-loading-cell">Đang tải dữ liệu số chuyến...</td></tr></tbody></table></div></section>
    <section className="panel table-card" id="homeSummaryTableCard" style={{ marginBottom: 24 }}><div className="table-card-head"><div className="table-title">Kết quả kinh doanh theo tháng</div><button type="button" className="sub-tab dashboard-export" title="Xuất ảnh" aria-label="Xuất ảnh kết quả kinh doanh" onClick={(event) => exportImage(event, 'TongQuan')}>Ảnh</button></div><div className="table-wrap"><table id="homeSummaryTable"><thead><tr>{['Tháng','Tổng khối lượng','Tổng doanh thu','Thuế TNDN','Thuế VAT','Dầu Quang Minh','Dầu đổ ngoài','Phí đường bộ','Lợi nhuận gộp','Chi quỹ thực tế','Lợi nhuận thực'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody><tr><td colSpan="11" className="dashboard-loading-cell">Đang tải dữ liệu tóm tắt...</td></tr></tbody></table></div></section>
  </div>;
}
