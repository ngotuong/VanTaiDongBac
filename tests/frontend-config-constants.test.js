const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stripScript = (source) => source.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');

function loadConstants() {
  const context = vm.createContext({});
  new vm.Script(stripScript(read('client_config_constants.html')), { filename: 'client_config_constants.html' }).runInContext(context);
  return (expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

test('frontend navigation constants preserve exact keys, labels, and bottom navigation', () => {
  const value = loadConstants();
  const nav = value('NAV');
  assert.deepEqual(nav.map((item) => item.slice(0, 3)), [
    ['home', 'Tổng quan', 'KPI & Biểu đồ'],
    ['reports', 'Báo cáo', 'Bảng chi tiết'],
    ['manage', 'Vận hành', 'Nhập & quản lý'],
    ['catalog', 'Danh mục', 'Danh mục hệ thống'],
    ['cashflow', 'Quỹ', 'Quản lý dòng tiền'],
    ['settings', 'Cài đặt', 'Cấu hình App']
  ]);
  assert.deepEqual(value('BOTTOM_NAV_KEYS'), ['home', 'reports', 'manage', 'catalog', 'cashflow']);
});

test('frontend form labels, icons, notes, and Sheet mappings preserve baseline', () => {
  const value = loadConstants();
  assert.deepEqual(value('FORM_LABELS'), {
    vanChuyen: 'Vận chuyển', taiXe: 'Tài xế', dau: 'Dầu lẻ', chamCong: 'Chấm công', phat: 'Phạt nội bộ', nghiVanHanh: 'Nghỉ vận hành'
  });
  assert.deepEqual(value('FORM_ICONS'), {
    vanChuyen: 'VC', taiXe: 'TX', dau: 'DA', chamCong: 'CC', phat: 'PH', nghiVanHanh: 'NV'
  });
  assert.equal(value('FORM_NOTES').vanChuyen, 'Số chuyến theo xe & dự án');
  assert.equal(value('FORM_NOTES').nghiVanHanh, 'Báo nghỉ mỏ & giảm KPI');
  assert.deepEqual(value('FORM_SHEET_MAP'), {
    vanChuyen: 'NL_VanChuyen', taiXe: 'NL_TaiXe', dau: 'NL_Dau', chamCong: 'NL_ChamCong', phat: 'NL_Phat', nghiVanHanh: 'NL_NghiVanHanh'
  });
  assert.deepEqual(value('SHEET_FORM_MAP'), {
    NL_VanChuyen: 'vanChuyen', NL_TaiXe: 'taiXe', NL_Dau: 'dau', NL_ChamCong: 'chamCong', NL_Phat: 'phat', NL_NghiVanHanh: 'nghiVanHanh'
  });
});

test('frontend field schema preserves keys, labels, kinds, and source order', () => {
  const value = loadConstants();
  assert.deepEqual(value('FIELD_SETS.vanChuyen'), [
    ['date', 'Ngày chạy', 'date'], ['vehicle', 'Biển số xe', 'select:vehicles'],
    ['project', 'Dự án chạy', 'select:projects'], ['trips', 'Số chuyến chạy', 'number'],
    ['tickets', 'Số phiếu/Chứng từ', 'text'], ['note', 'Ghi chú thêm', 'textarea']
  ]);
  assert.deepEqual(value('FIELD_SETS.dau'), [
    ['date', 'Ngày tiếp dầu', 'date'], ['vehicle', 'Biển số xe nhận', 'select:vehicles'],
    ['source', 'Nguồn cung cấp', 'select:fuelSources'], ['liters', 'Số lít dầu', 'number'],
    ['price', 'Giá dầu / lít', 'number'], ['sourcePay', 'Nguồn chi', 'select:fuelPaymentSources']
  ]);
  assert.deepEqual(value('Object.keys(FIELD_SETS)'), ['vanChuyen', 'taiXe', 'dau', 'chamCong', 'phat', 'nghiVanHanh']);
});

test('frontend page-size constants preserve existing pagination contracts', () => {
  const value = loadConstants();
  assert.equal(value('FUND_TRANSACTIONS_PAGE_SIZE'), 20);
  assert.equal(value('FUND_LOAN_HISTORY_PAGE_SIZE'), 20);
});

test('config constants and mutable state have separate single owners and load order', () => {
  const constants = read('client_config_constants.html');
  const state = read('client_config.html');
  assert.doesNotMatch(constants, /^\s*let\s/m);
  for (const name of ['appData', 'currentAuthUser', 'activeView', 'activeForm', 'rows', 'reportBundleRequestSeq', 'reportBundlePrefetching', 'reportCacheEpoch']) {
    assert.match(state, new RegExp(`let ${name}\\s*=`));
    assert.doesNotMatch(constants, new RegExp(`(?:let|const|var) ${name}\\s*=`));
  }
  for (const name of ['NAV', 'BOTTOM_NAV_KEYS', 'FORM_LABELS', 'FORM_ICONS', 'FORM_NOTES', 'FORM_SHEET_MAP', 'SHEET_FORM_MAP', 'FIELD_SETS', 'FUND_TRANSACTIONS_PAGE_SIZE', 'FUND_LOAN_HISTORY_PAGE_SIZE']) {
    assert.match(constants, new RegExp(`const ${name}\\s*=`));
    assert.doesNotMatch(state, new RegExp(`const ${name}\\s*=`));
  }
  for (const file of ['index.template.html', 'client.html']) {
    const html = read(file);
    assert.ok(html.indexOf("include('client_config_constants')") < html.indexOf("include('client_config')"));
  }
});
