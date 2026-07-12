const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadUtils() {
  const source = read('client_utils.html').replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
  const context = vm.createContext({});
  new vm.Script(source, { filename: 'client_utils.html' }).runInContext(context);
  return context;
}

test('frontend HTML and accent utilities preserve legacy output exactly', () => {
  const utils = loadUtils();
  assert.equal(utils.escapeHtml(null), '');
  assert.equal(utils.escapeHtml(`<a title="x">Tom & O'Reilly</a>`), '&lt;a title=&quot;x&quot;&gt;Tom &amp; O&#039;Reilly&lt;/a&gt;');
  assert.equal(utils.removeAccents('Đặng Thị Hồng'), 'Dang Thi Hong');
  assert.equal(utils.removeAccents(''), '');
});

test('frontend locale-number parsing preserves Vietnamese and fallback behavior', () => {
  const utils = loadUtils();
  assert.equal(utils.parseLocaleNumber('1.234.567 ₫'), 1234567);
  assert.equal(utils.parseLocaleNumber('1.234,5 đ'), 1234.5);
  assert.equal(utils.parseLocaleNumber('123,45'), 123.45);
  assert.equal(utils.parseLocaleNumber('12.5'), 12.5);
  assert.equal(utils.parseLocaleNumber('không phải số'), 0);
  assert.equal(utils.parseLocaleNumber(Infinity), 0);
});

test('frontend table-date formatting preserves accepted source formats', () => {
  const utils = loadUtils();
  assert.equal(utils.formatTableDate('2026-07-12', false), '12/07/26');
  assert.equal(utils.formatTableDate('12/07/2026', false), '12/07/26');
  assert.equal(utils.formatTableDate('12-07-26', true), '07/26');
  assert.equal(utils.formatTableDate('not-a-date', false), 'NaN/NaN/aN');
  assert.equal(utils.formatTableDate('', false), '');
});

test('frontend display/ISO date conversion preserves validation and passthrough', () => {
  const utils = loadUtils();
  assert.equal(utils.formatIsoDateForDisplay('2026-07-12T00:00:00'), '12/07/2026');
  assert.equal(utils.formatIsoDateForDisplay('1-2-26'), '01/02/2026');
  assert.equal(utils.formatIsoDateForDisplay('custom'), 'custom');
  assert.equal(utils.parseDisplayDateToIso('12/07/2026'), '2026-07-12');
  assert.equal(utils.parseDisplayDateToIso('12072026'), '2026-07-12');
  assert.equal(utils.parseDisplayDateToIso('31/02/2026'), '');
  assert.equal(utils.parseDisplayDateToIso('2026-07-12'), '2026-07-12');
});

test('client_utils is loaded first and is the single owner of extracted globals', () => {
  const template = read('index.template.html');
  const appsScriptClient = read('client.html');
  assert.ok(template.indexOf("include('client_utils')") < template.indexOf("include('client_config')"));
  assert.ok(appsScriptClient.indexOf("include('client_utils')") < appsScriptClient.indexOf("include('client_config')"));

  const fragments = fs.readdirSync(root).filter((name) => /^client_.*\.html$/.test(name));
  for (const functionName of ['escapeHtml', 'removeAccents', 'parseLocaleNumber', 'formatTableDate', 'formatIsoDateForDisplay', 'parseDisplayDateToIso']) {
    const owners = fragments.filter((file) => new RegExp(`function ${functionName}\\s*\\(`).test(read(file)));
    assert.deepEqual(owners, ['client_utils.html'], `${functionName} must have one frontend owner`);
  }
});
