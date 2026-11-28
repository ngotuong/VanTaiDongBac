const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

test('Vận hành keeps every row from available monthly snapshots and reports missing months', async () => {
  const months = new Map();
  for (let month = 5; month <= 8; month++) {
    const key = '2026-0' + month;
    months.set('month:' + key, {
      synced_at: '2026-08-30T00:00:00Z',
      payload: {
        headers: ['Ngày'],
        rows: Array.from({ length: 406 }, (_, index) => ({ rowIndex: month * 1000 + index, values: [key + '-15'] }))
      }
    });
  }
  const modules = {
    'server-only': {},
    '../../server/repositories/manage-bundle-repository.js': { createManageBundleRepository: () => ({ find: async (_config, _name, key) => months.get(key) || null }) },
    '../../server/runtime-config.js': { runtimeConfig: () => ({ supabaseUrl: 'local', serviceRoleKey: 'fixture' }) },
    './request-context.js': { loadServerWorkbookContext: async () => ({ year: '2026', spreadsheetId: 'fixture' }) },
    './platform/server-api-client': {}
  };
  const source = fs.readFileSync('next-shell/lib/manage-server.ts', 'utf8');
  const script = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const sandbox = { exports: {}, require: (name) => modules[name] };
  vm.runInNewContext(script.outputText, sandbox);
  const load = sandbox.exports.loadManageData;
  const interval = { startDate: '2026-05-01', endDate: '2026-08-31' };
  const full = (await load(interval)).data;
  assert.equal(full.rows.length, 1624);
  assert.equal(full.isLimited, false);
  months.delete('month:2026-07');
  const partial = (await load(interval)).data;
  assert.equal(partial.rows.length, 1218);
  assert.equal(partial.isLimited, true);
  assert.deepEqual(Array.from(partial.missingMonths), ['2026-07']);
  await assert.rejects(load({ startDate: '2026-02-30' }), { status: 400 });
  await assert.rejects(load({ startDate: '2027-01-01' }), { status: 400 });
});

test('a report range refuses a missing middle month even with both endpoint snapshots present', async () => {
  const reportHelpers = await import('../next-shell/lib/platform/report-c2.ts');
  const requested = [];
  const months = ['09/2026', '10/2026', '11/2026'];
  const modules = {
    'server-only': {},
    '../../server/repositories/report-bundle-repository.js': { createReportBundleRepository: () => ({
      findMonths: async (_config, keys) => {
        requested.push(...keys);
        return [{ report_month: months[0], payload: {} }, { report_month: months[2], payload: {} }];
      }
    }) },
    '../../server/runtime-config.js': { runtimeConfig: () => ({ supabaseUrl: 'local', serviceRoleKey: 'fixture' }) },
    './request-context.js': { loadServerWorkbookContext: async () => ({ year: '2026', spreadsheetId: 'fixture' }) },
    './platform/server-api-client': {},
    './platform/report-c2': reportHelpers,
    './catalog-server': { loadCatalogData: async () => ({ data: { headers: [] } }) }
  };
  const source = fs.readFileSync('next-shell/lib/report-server.ts', 'utf8');
  const script = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const sandbox = { exports: {}, require: (name) => modules[name] };
  vm.runInNewContext(script.outputText, sandbox);
  await assert.rejects(sandbox.exports.loadReportRangeData(months[0], months[2]), { status: 503, message: /10\/2026/ });
  assert.deepEqual(requested, months);
});
