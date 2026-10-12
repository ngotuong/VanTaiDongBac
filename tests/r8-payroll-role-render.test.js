const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Render the real component and context; no browser, live API or Sheet writes.
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  const localRequire = (name) => {
    if (!name.startsWith('.')) return require(name);
    const base = path.resolve(path.dirname(file), name);
    const resolved = [base, base + '.ts', base + '.tsx', base + '.js'].find((item) => fs.existsSync(item) && fs.statSync(item).isFile());
    assert.ok(resolved, `Missing component dependency: ${name}`);
    return load(resolved);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
const { ReportModule } = load('next-shell/components/report/ReportModule.tsx');
const { WorkbookContextProvider } = load('next-shell/components/platform/WorkbookContextProvider.tsx');
const initialBundle = {
  overview: { months: [['Tháng', 'Doanh thu'], ['10/2026', 100]], details: [] },
  payroll: [['Nhân sự', 'Chức vụ', 'Thực nhận'], ['QA Person', 'Quản lý', 123456]],
  apiCached: true
};
for (const role of ['admin', 'operator', 'shareholder', 'unknown']) {
  test(`actual report render: ${role} retains payroll, explanation follows permission`, () => {
    const html = renderToStaticMarkup(React.createElement(WorkbookContextProvider, {
      value: { user: { role } }
    }, React.createElement(ReportModule, { initialBundle })));
    assert.match(html, /QA Person/);
    assert.match(html, /123\.456/);
    const allowed = role === 'admin' || role === 'operator';
    assert.equal(html.includes('Xem giải trình lương của QA Person'), allowed);
    assert.equal(html.includes('report-payroll-explanation-head'), allowed);
    assert.equal(html.includes('report-payroll-explanation-action-cell'), allowed);
    assert.doesNotMatch(html, /payroll-explanation-modal/);
  });
}
