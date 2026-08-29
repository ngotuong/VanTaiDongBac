const test=require('node:test'),assert=require('node:assert/strict');

test('C3 Report C2 helpers preserve actual months, month filtering and formatted totals',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const matrix=[['Tháng','Doanh thu','Chi phí'],['05/2026','1.000.000','200.000'],['06/2026','2.000.000','300.000']];
  assert.deepEqual(helpers.reportMonths(matrix),['05/2026','06/2026']);
  assert.equal(helpers.latestReportMonth(matrix),'06/2026');
  assert.deepEqual(helpers.filterOverviewMatrix(matrix,'06/2026'),[matrix[0],matrix[2]]);
  const prepared=helpers.stripMonthColumn('finance',matrix[0],matrix.slice(1));
  // C2 reserves the first visible cell for the "Tổng cộng" label.
  assert.deepEqual(helpers.appendTotal(prepared.head,prepared.body).at(-1),['Tổng cộng','500.000']);
});

test('Report overview shows only data-bearing months with explicit labels and one period total',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const matrix=[['Tháng','Tổng khối lượng','Doanh thu'],['05/2026','10,50','1.000.000 ₫'],['06/2026','',''],['07/2026','20,25','2.500.000 ₫']];
  const dataMonths=helpers.reportDataMonths(matrix);
  assert.deepEqual(dataMonths,['05/2026','07/2026']);
  const pivot=helpers.transposeOverviewMatrix(matrix,dataMonths,'Tổng');
  assert.deepEqual(pivot[0],['Danh mục','Tháng 5','Tháng 7','Tổng']);
  assert.equal(pivot[1][1],'10,50');
  assert.equal(pivot[1][2],'20,25');
  assert.equal(pivot[1].at(-1),'30,75');
  assert.equal(pivot[2].at(-1),'3.500.000');
  assert.deepEqual(helpers.reportQuarterMonths(dataMonths,2),['05/2026']);
  assert.deepEqual(helpers.reportQuarterMonths(dataMonths,3),['07/2026']);
  assert.deepEqual(helpers.reportQuarterMonths(dataMonths,4),[]);
});

test('Report overview derives missing gross and real profit rows with detail-report semantics',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const matrix=[
    ['Tháng','Tổng doanh thu','Thuế TNDN','Thuế VAT','Dầu Quang Minh','Phí Đi Đường','Phí Phường','Dầu ngoài','Chi phí lương','Chi Quỹ'],
    ['05/2026','1.000','100','80','200','50','20','30','40','10']
  ];
  const enriched=helpers.ensureOverviewProfitColumns(matrix);
  assert.deepEqual(enriched[0].slice(-2),['Lợi nhuận gộp','Lợi nhuận thực']);
  assert.deepEqual(enriched[1].slice(-2),['550','470']);
  const pivot=helpers.transposeOverviewMatrix(matrix,['05/2026'],'Tổng');
  assert.deepEqual(pivot.at(-2),['Lợi nhuận gộp','550','550']);
  assert.deepEqual(pivot.at(-1),['Lợi nhuận thực','470','470']);
});

test('Report calendar range and bundle aggregation sum repeated payroll and vehicle identities',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  assert.deepEqual(helpers.calendarMonthRange('05/2026','07/2026'),['05/2026','06/2026','07/2026']);
  assert.deepEqual(helpers.monthsWithinRange(['07/2026','05/2026','06/2026'],'05/2026','06/2026'),['05/2026','06/2026']);
  const months=[['Tháng','Doanh thu'],['05/2026','100'],['06/2026','200']];
  const first={overview:{months,details:[['Danh mục','Tổng','A','B','Giải thích'],['Doanh thu','100','60','40','Nguồn']]},payroll:[['Tháng','Nhân sự','Chức vụ','Tổng lương','Công ty'],['05/2026','An','Tài xế','10','Đông Bắc']],vehicles:[['Tháng','Công ty','Biển số','Doanh thu'],['05/2026','Đông Bắc','20A','100']]};
  const second={overview:{months,details:[['Danh mục','Tổng','A','B','Giải thích'],['Doanh thu','200','120','80','Nguồn']]},payroll:[['Tháng','Nhân sự','Chức vụ','Tổng lương','Công ty'],['06/2026','An','Tài xế','20','Đông Bắc']],vehicles:[['Tháng','Công ty','Biển số','Doanh thu'],['06/2026','Đông Bắc','20A','200']]};
  const aggregate=helpers.aggregateReportBundles([first,second],['05/2026','06/2026']);
  assert.deepEqual(aggregate.overview.details[1],['Doanh thu','300','180','120','Nguồn']);
  assert.deepEqual(aggregate.payroll,[['Tháng','Nhân sự','Chức vụ','Tổng lương','Công ty'],['05/2026–06/2026','An','Tài xế','30','Đông Bắc']]);
  assert.deepEqual(aggregate.vehicles,[['Tháng','Công ty','Biển số','Doanh thu'],['05/2026–06/2026','Đông Bắc','20A','300']]);
});

test('C3 Report keeps profit rows in overview/detail and removes source totals only from row-level reports',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const rows=[['Tổng khối lượng','1.000'],['Tổng doanh thu','2.000'],['Chi phí dầu','300'],['Lợi nhuận thực','1.700']];
  assert.deepEqual(helpers.reportSourceRows('details',rows),rows);
  assert.deepEqual(helpers.reportSourceRows('finance',rows),rows);
  assert.deepEqual(helpers.reportSourceRows('vehicles',rows),[['Chi phí dầu','300']]);
});

test('Report total detection does not remove personnel whose name contains Công',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const rows=[['Dương Công Tiến Nội','Tài xế','13.000.000'],['Tổng cộng','','13.000.000']];
  assert.equal(helpers.isTotalRow(rows[0]),false);
  assert.equal(helpers.isTotalRow(rows[1]),true);
  assert.deepEqual(helpers.reportSourceRows('payroll',rows),[rows[0]]);
});

test('Payroll filters expose job titles and total row counts visible personnel',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const head=['Nhân sự','Chức vụ','Công ty','Số chuyến'];
  const body=[['An','Tài xế','Đông Bắc','10'],['Bình','Quản lý','Đông Bắc','2']];
  const filters=helpers.filterOptions('payroll',head,body);
  assert.equal(filters.jobIdx,1);
  assert.deepEqual(filters.jobs,['Quản lý','Tài xế']);
  assert.deepEqual(helpers.appendTotal(head,body).at(-1),['Tổng cộng','2 nhân sự','','12']);
});

test('C3 Report C2 search is accent-insensitive, multi-term and vehicle filters keep source columns',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const head=['Công ty','Biển số xe','Doanh thu'];
  const body=[['Đông Bắc','20H-12345','100'],['Quang Minh','20H-67890','200']];
  assert.equal(helpers.matchesReportRow(body[0],'dong bac; 67890'),true);
  assert.equal(helpers.matchesReportRow(body[0],'20H99999, 20H12345'),true);
  const filters=helpers.filterOptions('vehicles',head,body);
  assert.deepEqual({companyIdx:filters.companyIdx,plateIdx:filters.plateIdx},{companyIdx:0,plateIdx:1});
  assert.deepEqual(filters.companies,['Đông Bắc','Quang Minh']);
  const totalRow=helpers.appendTotal(head,[['Đông Bắc','20H-12345','100.000'],['Đông Bắc','20H-67890','200.000'],['Đông Bắc','20H-12345','150.000']]).at(-1);
  assert.deepEqual(totalRow,['Tổng cộng','2 xe','450.000']);
});

test('Report range aggregation merges the new project group and project rows by business key',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const months=[['Tháng','Doanh thu'],['07/2026','100'],['08/2026','300']];
  const first={overview:{months},projectGroups:[['Tháng','Công ty','Nhóm báo cáo','Số chuyến','Tổng khối lượng','Doanh thu','Tỷ trọng doanh thu'],['07/2026','Quang Quân','Tràng Duệ','10','100','100','100,0%']],projects:[['Tháng','Công ty','Nhóm báo cáo','Dự án','Số chuyến','Tổng khối lượng','Doanh thu'],['07/2026','Quang Quân','Tràng Duệ','Tràng Duệ 42','10','100','100']]};
  const second={overview:{months},projectGroups:[['Tháng','Công ty','Nhóm báo cáo','Số chuyến','Tổng khối lượng','Doanh thu','Tỷ trọng doanh thu'],['08/2026','Quang Quân','Tràng Duệ','20','200','300','100,0%']],projects:[['Tháng','Công ty','Nhóm báo cáo','Dự án','Số chuyến','Tổng khối lượng','Doanh thu'],['08/2026','Quang Quân','Tràng Duệ','Tràng Duệ 42','20','200','300']]};
  const aggregate=helpers.aggregateReportBundles([first,second],['07/2026','08/2026']);
  assert.deepEqual(aggregate.projectGroups[1],['07/2026–08/2026','Quang Quân','Tràng Duệ','30','300','400','100,0%']);
  assert.deepEqual(aggregate.projects[1],['07/2026–08/2026','Quang Quân','Tràng Duệ','Tràng Duệ 42','30','300','400']);
});

test('Report totals never coerce identifiers or notes that merely start with digits',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  assert.equal(helpers.parseCellValue('20H05664'),null);
  assert.equal(helpers.parseCellValue('T6 dương 4tr833'),null);
  assert.equal(helpers.parseCellValue('1.527'),1527);
  assert.equal(helpers.parseCellValue('9.108,94'),9108.94);
  assert.equal(helpers.parseCellValue('34.378.000 ₫'),34378000);
});

test('Report display removes currency units and rounds every money column without changing quantities',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  assert.equal(helpers.formatReportDisplayValue('finance','Tổng doanh thu',['9.108,94','270.513.180,00'],1),'270.513.180');
  assert.equal(helpers.formatReportDisplayValue('details','Tổng',['Tổng doanh thu','270.513.180 đ'],1),'270.513.180');
  assert.equal(helpers.formatReportDisplayValue('payroll','Lương chuyến',['Tài xế','945.000 ₫'],1),'945.000');
  assert.equal(helpers.formatReportDisplayValue('vehicles','Tiền dầu',['20H001','34.378.000 đ'],1),'34.378.000');
  assert.equal(helpers.formatReportDisplayValue('finance','Tổng khối lượng',['9.108,94'],0),'9.108,94');
});

test('Report repairs empty company detail columns from vehicle ownership without changing source totals',async()=>{
  const helpers=await import('../next-shell/lib/platform/report-c2.ts');
  const details=[
    ['Danh mục','Tổng','Quang Quân','Minh Vương','Giải thích'],
    ['Tổng khối lượng','300,00','0,00','0,00',''],
    ['Tổng doanh thu','32.400.000 ₫','0 ₫','0 ₫',''],
    ['Doanh thu chưa VAT','30.000.000 ₫','0 ₫','0 ₫',''],
    ['Thuế TNDN','3.000.000 ₫','0 ₫','0 ₫',''],
    ['Thuế VAT','2.400.000 ₫','0 ₫','0 ₫',''],
    ['Chi phí dầu','9.000.000 ₫','4.000.000 ₫','5.000.000 ₫','Nguồn Quang Minh'],
    ['Lợi nhuận gộp','18.000.000 ₫','-4.000.000 ₫','-5.000.000 ₫','']
  ];
  const vehicles=[
    ['Công ty','Biển số','Tổng khối','Doanh thu'],
    ['OK','20H-001','100,00','10.800.000 ₫'],
    ['OK','20H-002','200,00','21.600.000 ₫']
  ];
  const repaired=helpers.repairCompanyReport(details,vehicles,{'20H001':'Quang Quân','20H002':'Minh Vương'});
  assert.deepEqual(repaired.vehicles[1].slice(0,2),['Quang Quân','20H-001']);
  assert.deepEqual(repaired.vehicles[2].slice(0,2),['Minh Vương','20H-002']);
  assert.deepEqual(repaired.details[1].slice(1,4),['300,00','100,00','200,00']);
  assert.deepEqual(repaired.details[2].slice(1,4),['32.400.000 ₫','10.800.000 ₫','21.600.000 ₫']);
  assert.deepEqual(repaired.details[3].slice(2,4),['10.000.000 ₫','20.000.000 ₫']);
  assert.deepEqual(repaired.details[7].slice(2,4),['5.000.000 ₫','13.000.000 ₫']);
});

test('Report detail gives Quang Quân and Minh Vương the same numeric typography contract',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.resolve(__dirname,'../next-shell/components/report/ReportModule.tsx'),'utf8');
  const css=fs.readFileSync(path.resolve(__dirname,'../next-shell/app/platform.css'),'utf8');
  assert.match(source,/normalizedLabel\.includes\('quang quan'\) \|\| normalizedLabel\.includes\('minh vuong'\)/);
  assert.match(source,/fontSize: '12\.5px', lineHeight: 1\.3, fontWeight: 600/);
  assert.match(css,/body #reportsView table\.report-data-table-details td\.report-detail-company-cell[\s\S]*font-size: var\(--platform-table-body-font-size\) !important;[\s\S]*font-weight: 600 !important/);
});

test('Vehicle report uses the profit semantic color for Lãi sau lương',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.resolve(__dirname,'../next-shell/components/report/ReportModule.tsx'),'utf8');
  assert.match(source,/label\.includes\('lãi sau lương'\)[\s\S]*color: value < 0 \? '#dc2626' : '#0284c7'/);
});
