const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const utilitySource = read('NormalizationUtils.gs');
const serviceFiles = [
  'AppConfig.gs',
  'ValidationService.gs',
  'SheetService.gs',
  'FundService.gs',
  'SupabaseService.gs'
];

function loadCleanHelper() {
  const context = vm.createContext({});
  new vm.Script(utilitySource, { filename: 'NormalizationUtils.gs#test' }).runInContext(context);
  return context.normalizeCleanValue_;
}

test('shared clean normalization preserves the legacy null, string, number and boolean behavior', () => {
  const clean = loadCleanHelper();
  const cases = [
    { input: null, expected: '' },
    { input: undefined, expected: '' },
    { input: '', expected: '' },
    { input: '  Vận tải Đông Bắc  ', expected: 'Vận tải Đông Bắc' },
    { input: '\u00a0Thu chi\u00a0', expected: 'Thu chi' },
    { input: 0, expected: '0' },
    { input: -12.5, expected: '-12.5' },
    { input: true, expected: 'true' },
    { input: false, expected: 'false' }
  ];

  cases.forEach(({ input, expected }) => assert.equal(clean(input), expected));
});

test('shared clean normalization retains JavaScript String conversion for arrays and objects', () => {
  const clean = loadCleanHelper();
  assert.equal(clean([' A ', 'B']), 'A ,B');
  assert.equal(clean({ toString: () => '  custom value  ' }), 'custom value');
});

test('all legacy clean wrappers delegate to the shared helper without changing their names', () => {
  serviceFiles.forEach((file) => {
    const source = read(file);
    assert.match(
      source,
      /function clean_\(value\) \{\s*return normalizeCleanValue_\(value\);\s*\}/,
      `${file} must keep clean_ as a compatibility wrapper`
    );
  });
});

test('legacy clean implementation has a single backend source of truth', () => {
  assert.match(utilitySource, /value === null \|\| value === undefined \? '' : String\(value\)\.trim\(\)/);
  serviceFiles.forEach((file) => {
    assert.doesNotMatch(
      read(file),
      /value === null \|\| value === undefined \? '' : String\(value\)\.trim\(\)/,
      `${file} still duplicates the clean implementation`
    );
  });
});
