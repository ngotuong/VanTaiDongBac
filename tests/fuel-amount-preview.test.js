const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => dependencies[name] });
  return module.exports;
}
const numeric = load('next-shell/lib/platform/numeric-input.ts');
const fuel = load('next-shell/lib/platform/fuel-amount-preview.ts', { './numeric-input': numeric });
const schema = load('next-shell/lib/platform/business-form-schema.ts');
const contrast = load('next-shell/lib/platform/color-contrast.ts');

test('fuel preview handles Vietnamese decimal quantities and grouped unit prices', () => {
  assert.equal(fuel.fuelAmountPreview('120', '20.000'), 2400000);
  assert.equal(fuel.fuelAmountPreview('165,3', '23.500'), 3884550);
  assert.ok(Math.abs(fuel.fuelAmountPreview('0,125', '20.000,5') - 2500.0625) < 1e-8);
  assert.equal(fuel.formatFuelAmountPreview(2500.0625), '2.500,06 đ');
});
test('missing, partial, invalid and non-positive inputs never present a payable amount', () => {
  for (const [liters, price] of [['', '20.000'], ['120', ''], ['-', '20.000'], ['12,', '20.000'], ['-12', '20.000'], ['0', '20.000'], ['120', 'abc'], ['120', '0'], ['1e999', '20.000']]) assert.equal(fuel.fuelAmountPreview(liters, price), null, `${liters}/${price}`);
  assert.equal(fuel.formatFuelAmountPreview(null), '—');
});
test('display rounding does not alter the raw multiplication or include derived columns in input schema', () => {
  const raw = fuel.fuelAmountPreview('0,125', '20.000,5');
  fuel.formatFuelAmountPreview(raw);
  assert.equal(raw, 2500.0625);
  assert.ok(!schema.FUEL_FORM.fields.some(field => ['amount', 'owner', 'month'].includes(field.key)));
});
test('project identity and distance share a row while retaining all eight source fields', () => {
  assert.equal(schema.PROJECT_FORM.fields.length, 8);
  assert.equal(schema.PROJECT_FORM.fields[0].key, 'project');
  assert.equal(schema.PROJECT_FORM.fields[1].key, 'distance');
  assert.equal(schema.PROJECT_FORM.fields[0].span, 'half');
  assert.equal(schema.PROJECT_FORM.fields[1].span, 'half');
  assert.equal(schema.PROJECT_FORM.fields.find(field => field.key === 'note').span, 'full');
});
test('contrast calculation distinguishes weak light teal from readable primary combinations', () => {
  assert.equal(contrast.colorContrast('#000000', '#ffffff'), 21);
  assert.equal(contrast.colorContrast('#000', '#fff'), 21);
  assert.ok(contrast.colorContrast('#ffffff', '#0d9488') < 4.5);
  assert.ok(contrast.colorContrast('#ffffff', '#062e2b') > 4.5);
  assert.ok(contrast.colorContrast('#063b36', '#5eead4') > 4.5);
  assert.equal(contrast.colorContrast('rgba(1,2,3,.2)', '#ffffff'), null);
});

test('live header binding preserves identity, free text and boolean values while formatting fuel prices', () => {
  for (const header of ['Diễn giải','Tên dự án','Chế độ lương','Mã phạt','Lương chuyến?','Áp dụng thưởng QL?']) assert.equal(schema.businessHeaderIsNumber(header),false,header);
  for (const header of ['Giá dầu','Giá dầu áp dụng','Số km','Km','Nghỉ chuẩn','Mức khấu trừ/tháng']) assert.equal(schema.businessHeaderIsNumber(header),true,header);
  assert.equal(schema.businessHeaderField('Dự án').span,'half');
  assert.equal(schema.businessHeaderField('Số km').span,'half');
  assert.equal(schema.businessHeaderField('Ghi chú').kind,'textarea');
  assert.equal(schema.businessHeaderField('Trường nguồn mới').span,'full');
  assert.equal(schema.businessHeaderField('Lương chuyến?', ['Có','Không']).kind,'select');
});

test('uppercase Vietnamese Đ and context-dependent From/To keep their business types', () => {
  assert.equal(schema.businessHeaderField('Đến ngày').kind,'date');
  assert.equal(schema.businessHeaderIsNumber('Đơn giá'),true);
  assert.equal(schema.businessHeaderField('Từ',[],'DM_LuongChuyen').kind,'number');
  assert.equal(schema.businessHeaderField('Đến',[],'DM_LuongChuyen').kind,'number');
  assert.equal(schema.businessHeaderField('Từ',[],'DM_DonGiaVanChuyen').kind,'date');
  assert.equal(schema.businessHeaderField('Đến',[],'DM_DonGiaVanChuyen').kind,'date');
  assert.equal(schema.businessHeaderIsNumber('Từ','DM_DonGiaVanChuyen'),false);
});
