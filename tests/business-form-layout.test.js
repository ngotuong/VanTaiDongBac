const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('next-shell/lib/platform/business-form-layout.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(output, { module: loaded, exports: loaded.exports });
const span = loaded.exports.businessFieldMobileSpan;

test('short business values can share mobile rows without squeezing long identities', () => {
  for (const name of ['Từ ngày', 'Đến ngày', 'Tính thưởng', 'Dừng thưởng', 'Lương cứng', 'Số km', 'Biển số', 'Lương chuyến?', 'Thưởng QL?', 'Mức khoán', 'Mức khấu trừ/tháng', 'Khối lượng']) assert.equal(span(name), 'half', name);
  for (const name of ['Dự Án', 'Nhân sự', 'Người tuyển', 'Công ty', 'Nhóm vận hành', 'Ghi chú', 'Nội dung', 'Trường mới chưa phân loại', 'Diễn giải', 'Điều kiện']) assert.equal(span(name), 'full', name);
});

test('explicit date/number types take precedence over identity words in labels', () => {
  assert.equal(span('Ngày nghỉ nhân sự', 'date'), 'half');
  assert.equal(span('Số tiền dự án', 'number'), 'half');
  assert.equal(span('Số phiếu', 'text'), 'full');
  assert.equal(span('Số km', 'textarea'), 'full');
});
