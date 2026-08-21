const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Settings reusable pill switch has accessible state and a 44px touch target', () => {
  const component = read('next-shell/components/settings/PillSwitch.tsx');
  const css = read('next-shell/app/c2-golden.css');
  assert.match(component, /role="switch"/);
  assert.match(component, /aria-checked=\{checked\}/);
  assert.match(component, /aria-label=\{label\}/);
  assert.match(css, /\.pill-switch \{[\s\S]*?height: 44px !important;[\s\S]*?min-height: 44px !important;/);
  assert.match(css, /\.pill-switch\[aria-checked="true"\] \.pill-switch-thumb/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Settings mobile grid and account cards cannot widen the viewport', () => {
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  const css = read('next-shell/app/c2-golden.css');
  assert.match(css, /\.settings-c2 \.settings-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(css, /\.settings-c2 \.account-users-table \{[\s\S]*?min-width: 0 !important;/);
  assert.match(css, /\.settings-c2 \.account-users-table thead \{ display: none; \}/);
  assert.match(css, /#settingsView\.settings-c2 #changePasswordBtn\.primary\.account-submit-btn,[\s\S]*?#settingsView\.settings-c2 #createAccountBtn\.primary \{[\s\S]*?height: 44px !important;[\s\S]*?max-height: none !important;/);
  assert.match(settings, /data-label="Tên đăng nhập"/);
  assert.match(settings, /data-label="Trạng thái"/);
  assert.match(settings, /<PillSwitch checked=\{draft\.active\}/);
  assert.doesNotMatch(settings, /className="account-active-toggle"><input type="checkbox"/);
});

test('Dense Settings actions use progressive disclosure and only persistent states use switches', () => {
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  const fundAlert = read('next-shell/components/settings/FundAlertSettings.tsx');
  const css = read('next-shell/app/c2-golden.css');
  assert.match(settings, /<details className="account-create-disclosure">/);
  assert.match(fundAlert, /<details className="fund-alert-disclosure">/);
  assert.match(fundAlert, /fund-alert-rule-toggle/);
  assert.match(fundAlert, /fund-alert-rule-card/);
  assert.match(fundAlert, /fund-alert-rule-title-row/);
  assert.doesNotMatch(fundAlert, /Đang bật|Đang tắt/);
  assert.match(fundAlert, /formatVietnameseNumberInput\(String\(rule\.thresholdValue/);
  assert.match(css, /\.fund-alert-form input\[type="text"\],[\s\S]*font-weight: 500/);
  assert.match(fundAlert, /Mở rộng quy tắc cảnh báo/);
  assert.match(fundAlert, /Kiểm tra bản nháp — không gửi/);
  assert.match(fundAlert, /<PillSwitch checked=\{rule\.enabled\}/);
  assert.doesNotMatch(fundAlert, /label=.*Kiểm tra.*PillSwitch/);
  assert.match(settings, /label={`Đặt lại mật khẩu tài khoản/);
  assert.match(settings, /role="tablist" aria-label="Nhóm cài đặt"/);
  assert.match(settings, /role="tabpanel"/);
  assert.match(settings, /label="Làm mới danh sách tài khoản"/);
  assert.match(settings, /aria-label=\{label\} title=\{label\}/);
});

test('Fund alert roles use compact visual checkboxes without shrinking the label hit area', () => {
  const css = read('next-shell/app/notification-settings-v3.css');
  assert.match(css, /\.fund-alert-role \{[\s\S]*?min-height: 36px/);
  assert.match(css, /fund-alert-role input\[type="checkbox"\][\s\S]*?width: 17px !important;[\s\S]*?height: 17px !important;/);
});
