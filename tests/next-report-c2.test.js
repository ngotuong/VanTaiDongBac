const test=require('node:test'),assert=require('node:assert/strict');

test('C3 Report C2 helpers preserve actual months, month filtering and formatted totals',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const matrix=[['Tháng','Doanh thu','Chi phí'],['05/2026','1.000.000','200.000'],['06/2026','2.000.000','300.000']];
  assert.deepEqual(helpers.reportMonths(matrix),['05/2026','06/2026']);
  assert.deepEqual(helpers.filterOverviewMatrix(matrix,'06/2026'),[matrix[0],matrix[2]]);
  const prepared=helpers.stripMonthColumn('finance',matrix[0],matrix.slice(1));
  // C2 reserves the first visible cell for the "Tổng cộng" label.
  assert.deepEqual(helpers.appendTotal(prepared.head,prepared.body).at(-1),['Tổng cộng','500.000']);
});

test('C3 Report C2 search is accent-insensitive, multi-term and vehicle filters keep source columns',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const head=['Công ty','Biển số xe','Doanh thu'];
  const body=[['Đông Bắc','20H-12345','100'],['Quang Minh','20H-67890','200']];
  assert.equal(helpers.matchesReportRow(body[0],'dong bac; 67890'),true);
  const filters=helpers.filterOptions('vehicles',head,body);
  assert.deepEqual({companyIdx:filters.companyIdx,plateIdx:filters.plateIdx},{companyIdx:0,plateIdx:1});
  assert.deepEqual(filters.companies,['Đông Bắc','Quang Minh']);
});
