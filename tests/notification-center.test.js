const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createNotificationCenterService } = require('../server/services/notification-center-service');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('notification cache is derived read-only from XL_DoiSoatChuyen and synced every five minutes', () => {
  const sync = read('TripNotificationSyncService.gs');
  const facade = read('SupabaseService.gs');
  assert.match(sync, /SpreadsheetApp\.openById\(APP_CONFIG\.spreadsheetId\)/);
  assert.match(sync, /XL_DoiSoatChuyen/);
  assert.match(sync, /manage_data_bundles/);
  assert.match(sync, /notifications:active/);
  assert.doesNotMatch(sync, /setValue|setValues|appendRow|deleteRow/);
  assert.match(sync, /reconciliation/);
  assert.match(sync, /hot-bonus/);
  assert.match(facade, /TRIP_NOTIFICATION_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(facade, /syncTripNotificationsIfDue_\(props, nowMillis, deadlineMillis\)/);
});

test('operations notifications trust only workbook helper columns and never write Google Sheets', () => {
  const sync = read('OperationalNotificationSyncService.gs');
  assert.match(sync, /NL_ChamCong/);
  assert.match(sync, /NL_PhanCongLai/);
  assert.match(sync, /row\[10\]/);
  assert.match(sync, /row\[4\]/);
  assert.match(sync, /operations:active/);
  assert.doesNotMatch(sync, /setValue|setValues|appendRow|deleteRow/);
});

test('daily digest summary uses previous-day transport and exact monthly Fund overview', () => {
  const summary = read('DailyBusinessSummaryService.gs');
  const facade = read('SupabaseService.gs');
  const repository = read('server/repositories/notification-bundle-repository.js');
  const center = read('server/services/notification-center-service.js');
  const dispatch = read('server/services/notification-dispatch-service.js');
  assert.match(summary, /SpreadsheetApp\.openById\(APP_CONFIG\.spreadsheetId\)/);
  assert.match(summary, /XL_VanChuyen/);
  assert.match(summary, /daily-summary:latest/);
  assert.match(summary, /row\[columns\.trips\]/);
  assert.match(summary, /row\[columns\.volume\]/);
  assert.match(summary, /resolveColumns_\(source\)/);
  assert.match(summary, /\['Doanh thu', 'Doanh thu ước tính'\]/);
  assert.match(summary, /row\[columns\.revenue\]/);
  assert.doesNotMatch(summary, /setValue|setValues|appendRow|deleteRow/);
  assert.match(facade, /syncDailyBusinessSummary\(\)/);
  const publicApi = read('PublicApi.gs');
  assert.match(publicApi, /function syncDailyBusinessSummary\(\)/);
  assert.match(publicApi, /return SupabaseService\.syncDailyBusinessSummary\(\)/);
  assert.doesNotMatch(read('ApiActionRegistry.gs'), /syncDailyBusinessSummary/);
  assert.match(repository, /findDailySummary/);
  assert.match(repository, /findFundDailySummary/);
  assert.match(repository, /fund_overview_bundles/);
  assert.match(dispatch, /Tổng hợp ngày/);
  assert.match(dispatch, /Doanh thu/);
  assert.match(dispatch, /Chi Quỹ:/);
  assert.match(dispatch, /Chi phí lương/);
  assert.match(dispatch, /Lợi nhuận gộp ước tính/);
  assert.match(center, /DAILY_ACTUAL_CASH_EXCLUDED_CATEGORIES/);
  assert.match(center, /DAILY_FUEL_CATEGORIES/);
  assert.match(center, /grossProfitAvailable/);
  assert.match(dispatch, /Số chuyến:/);
  assert.match(dispatch, /Doanh thu:/);
  assert.match(dispatch, /\.join\('\\n'\)/);
});

test('daily summary resolves the live revenue header after the internal-discount column', () => {
  const headers = ['Ngày', 'Tháng', 'Biển số', 'Dự án', 'Số chuyến', 'Khối lượng', 'Số km', 'Giá dầu', 'Đơn giá gốc', 'Điều chỉnh', 'Ưu đãi nội bộ', 'Đơn giá', 'Doanh thu'];
  const rows = [
    [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05664', 'Tràng Duệ 44,5', 3, 75, 0, 28080, 120000, 0, 0, 127320, 9549000],
    [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05602', 'Tràng Duệ 44,5', 2, 50, 0, 28080, 120000, 0, 0, 127320, 6366000]
  ];
  let cachedPayload;
  const source = {
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length + 1,
    getRange: (row) => row === 1 ? { getDisplayValues: () => [headers] } : { getValues: () => rows }
  };
  const sandbox = {
    APP_CONFIG: { spreadsheetId: 'transport' },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => source }), flush: () => {} }
  };
  vm.runInNewContext(read('DailyBusinessSummaryService.gs'), sandbox);
  const result = sandbox.DailyBusinessSummaryService.sync({
    nowDate: () => new Date('2026-09-05T12:00:00+07:00'),
    nowISOString: () => '2026-09-05T05:00:00.000Z',
    formatDate: (date, pattern) => pattern === 'yyyy-MM-dd' ? date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) : '04/09/2026',
    upsertRows: (_table, entries) => { cachedPayload = entries[0].payload; },
    writeSyncStatus: () => {}
  });
  assert.equal(result.revenue, 15915000);
  assert.equal(result.revenue, cachedPayload.revenue);
  assert.notEqual(result.revenue, 254640);
});

test('trip reconciliation reports one compact success only when every vehicle is matched', () => {
  const crypto = require('node:crypto');
  const currentRow = [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05664', 'Tràng Duệ 44,5', 3, 3, 0, 'Khớp', '', '', 0, 0, '', 0, 0, '', 0];
  const secondRow = [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05602', 'Tràng Duệ 44,5', 2, 2, 0, 'Khớp', '', '', 0, 0, '', 0, 0, '', 0];
  const source = { getLastRow: () => 3, getRange: () => ({ getValues: () => [currentRow, secondRow] }) };
  const transport = { getLastRow: () => 3 };
  let payload;
  const sandbox = {
    APP_CONFIG: { spreadsheetId: 'transport', year: '2026' },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => name === 'XL_DoiSoatChuyen' ? source : transport }), flush: () => {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest())
    }
  };
  vm.runInNewContext(read('TripNotificationSyncService.gs'), sandbox);
  sandbox.TripNotificationSyncService.sync({
    nowDate: () => new Date('2026-09-05T10:00:00+07:00'),
    nowISOString: () => '2026-09-05T03:00:00.000Z',
    formatDate: (date, pattern) => pattern === 'dd/MM/yyyy' ? '04/09/2026' : date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }),
    readRows: () => [{ payload: { items: [
      { type: 'reconciliation', date: '2026-09-04', plate: '20H05664', project: 'Tràng Duệ 44,5', sourceRow: 2 },
      { type: 'reconciliation', date: '2026-09-04', plate: '20H05602', project: 'Tràng Duệ 44,5', sourceRow: 3 }
    ] } }],
    upsertRows: (_table, entries) => { payload = entries[0].payload; },
    writeSyncStatus: () => {}
  });
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].type, 'reconciliation-resolved-group');
  assert.equal(payload.items[0].title, 'Tất cả số chuyến đã khớp');
  assert.equal(payload.items[0].message, 'Không còn xe nào lệch số chuyến.');
  assert.equal(payload.items[0].resolvedItems.length, 2);
  const notificationCenter = read('next-shell/components/platform/NotificationCenter.tsx');
  assert.match(notificationCenter, /'reconciliation-resolved-group'/);
  assert.match(notificationCenter, /item\.type === 'reconciliation-resolved-group' \? '✓'/);
});

test('all-matched notification keeps the same semantic id after midnight', () => {
  const crypto = require('node:crypto');
  const row = [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05664', 'Tràng Duệ 44,5', 3, 3, 0, 'Khớp', '', '', 0, 0, '', 0, 0, '', 0];
  const source = { getLastRow: () => 2, getRange: () => ({ getValues: () => [row] }) };
  const transport = { getLastRow: () => 2 };
  const sandbox = {
    APP_CONFIG: { spreadsheetId: 'transport', year: '2026' },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => name === 'XL_DoiSoatChuyen' ? source : transport }), flush: () => {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest())
    }
  };
  vm.runInNewContext(read('TripNotificationSyncService.gs'), sandbox);
  let previousItems = [{ type: 'reconciliation', date: '2026-09-04', plate: '20H05664', project: 'Tràng Duệ 44,5', sourceRow: 2 }];
  const run = (now, nowIso) => {
    let payload;
    sandbox.TripNotificationSyncService.sync({
      nowDate: () => now,
      nowISOString: () => nowIso,
      formatDate: (date, pattern) => pattern === 'dd/MM/yyyy' ? '04/09/2026' : date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }),
      readRows: () => [{ payload: { items: previousItems } }],
      upsertRows: (_table, entries) => { payload = entries[0].payload; },
      writeSyncStatus: () => {}
    });
    previousItems = payload.items;
    return payload.items[0];
  };
  const first = run(new Date('2026-09-05T23:58:00+07:00'), '2026-09-05T16:58:00.000Z');
  const afterMidnight = run(new Date('2026-09-06T00:05:00+07:00'), '2026-09-05T17:05:00.000Z');
  assert.equal(first.id, afterMidnight.id);
  assert.equal(first.date, afterMidnight.date);
  assert.ok(afterMidnight.legacyIds.includes(first.id));
});

test('trip reconciliation suppresses the all-matched success while any vehicle is mismatched', () => {
  const crypto = require('node:crypto');
  const matchedRow = [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05664', 'Tràng Duệ 44,5', 3, 3, 0, 'Khớp', '', '', 0, 0, '', 0, 0, '', 0];
  const mismatchedRow = [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05602', 'Tràng Duệ 44,5', 2, 1, 1, 'Lệch', '', '', 0, 0, '', 0, 0, '', 0];
  const source = { getLastRow: () => 3, getRange: () => ({ getValues: () => [matchedRow, mismatchedRow] }) };
  const transport = { getLastRow: () => 3 };
  let payload;
  const sandbox = {
    APP_CONFIG: { spreadsheetId: 'transport', year: '2026' },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => name === 'XL_DoiSoatChuyen' ? source : transport }), flush: () => {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest())
    }
  };
  vm.runInNewContext(read('TripNotificationSyncService.gs'), sandbox);
  sandbox.TripNotificationSyncService.sync({
    nowDate: () => new Date('2026-09-05T10:00:00+07:00'),
    nowISOString: () => '2026-09-05T03:00:00.000Z',
    formatDate: (date, pattern) => pattern === 'dd/MM/yyyy' ? '04/09/2026' : date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }),
    readRows: () => [{ payload: { items: [
      { type: 'reconciliation', date: '2026-09-04', plate: '20H05664', project: 'Tràng Duệ 44,5', sourceRow: 2 }
    ] } }],
    upsertRows: (_table, entries) => { payload = entries[0].payload; },
    writeSyncStatus: () => {}
  });
  assert.equal(payload.items.some((item) => item.type === 'reconciliation-resolved-group'), false);
  const mismatch = payload.items.find((item) => item.type === 'reconciliation');
  assert.ok(mismatch);
  assert.match(mismatch.message, /20H05602/);
  assert.match(mismatch.message, /báo cáo 2, tài xế 1, lệch 1/);
});

test('hot bonus notifications include only vehicles with a positive reward amount', () => {
  const crypto = require('node:crypto');
  const conditionOnly = [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05664', 'Tràng Duệ 44,5', 4, 4, 0, '', '', 'Đạt mốc ngày', 1, 0, '', 0, 0, 'Có ghi chú nhưng chưa đạt tiền thưởng', 0];
  const rewarded = [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05602', 'Tràng Duệ 44,5', 5, 5, 0, '', '', 'Đạt mốc tháng', 2, 100000, '', 3, 200000, 'Đạt thưởng', 300000];
  const source = { getLastRow: () => 3, getRange: () => ({ getValues: () => [conditionOnly, rewarded] }) };
  const transport = { getLastRow: () => 3 };
  let payload;
  const sandbox = {
    APP_CONFIG: { spreadsheetId: 'transport', year: '2026' },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => name === 'XL_DoiSoatChuyen' ? source : transport }), flush: () => {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest())
    }
  };
  vm.runInNewContext(read('TripNotificationSyncService.gs'), sandbox);
  sandbox.TripNotificationSyncService.sync({
    nowDate: () => new Date('2026-09-05T10:00:00+07:00'),
    nowISOString: () => '2026-09-05T03:00:00.000Z',
    formatDate: (date) => date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }),
    readRows: () => [],
    upsertRows: (_table, entries) => { payload = entries[0].payload; },
    writeSyncStatus: () => {}
  });
  const bonuses = payload.items.filter((item) => item.type === 'hot-bonus');
  assert.equal(bonuses.length, 1);
  assert.equal(bonuses[0].plate, '20H05602');
  assert.equal(bonuses[0].amount, 300000);
  assert.equal(bonuses[0].title, 'Xe đạt thưởng nóng');
});

test('trip notification ids remain stable when a source row is inserted above the same business event', () => {
  const crypto = require('node:crypto');
  const rewarded = [new Date('2026-09-04T00:00:00+07:00'), '09/2026', '20H05602', 'Tràng Duệ 44,5', 5, 5, 0, 'Khớp', '', 'Đạt mốc tháng', 2, 100000, '', 3, 200000, 'Đạt thưởng', 300000];
  const blank = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const ids = [];
  for (const rows of [[rewarded], [blank, rewarded]]) {
    const source = { getLastRow: () => rows.length + 1, getRange: () => ({ getValues: () => rows }) };
    const transport = { getLastRow: () => rows.length + 1 };
    let payload;
    const sandbox = {
      APP_CONFIG: { spreadsheetId: 'transport', year: '2026' },
      SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => name === 'XL_DoiSoatChuyen' ? source : transport }), flush: () => {} },
      Utilities: {
        DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
        computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest())
      }
    };
    vm.runInNewContext(read('TripNotificationSyncService.gs'), sandbox);
    sandbox.TripNotificationSyncService.sync({
      nowDate: () => new Date('2026-09-05T10:00:00+07:00'),
      nowISOString: () => '2026-09-05T03:00:00.000Z',
      formatDate: (date) => date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }),
      readRows: () => [],
      upsertRows: (_table, entries) => { payload = entries[0].payload; },
      writeSyncStatus: () => {}
    });
    ids.push(payload.items.find((item) => item.type === 'hot-bonus').id);
  }
  assert.equal(ids[0], ids[1]);
});

test('operational notification ids remain stable when rows move', () => {
  const crypto = require('node:crypto');
  const attendance = [new Date('2026-09-04T00:00:00+07:00'), new Date('2026-09-04T00:00:00+07:00'), '', 'Nhân sự A', 'Nghỉ phép', '', '', '', '', '', 'Thiếu xác nhận'];
  const blank = ['', '', '', '', '', '', '', '', '', '', ''];
  const ids = [];
  for (const rows of [[attendance], [blank, attendance]]) {
    const attendanceSheet = { getLastRow: () => rows.length + 1, getRange: () => ({ getValues: () => rows }) };
    const assignmentSheet = { getLastRow: () => 1 };
    let payload;
    const sandbox = {
      APP_CONFIG: { spreadsheetId: 'transport', year: '2026' },
      SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => name === 'NL_ChamCong' ? attendanceSheet : assignmentSheet }) },
      Utilities: {
        DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
        computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest())
      }
    };
    vm.runInNewContext(read('OperationalNotificationSyncService.gs'), sandbox);
    sandbox.OperationalNotificationSyncService.sync({
      nowISOString: () => '2026-09-05T03:00:00.000Z',
      formatDate: (date) => date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }),
      upsertRows: (_table, entries) => { payload = entries[0].payload; },
      writeSyncStatus: () => {}
    });
    ids.push(payload.items[0].id);
  }
  assert.equal(ids[0], ids[1]);
});

test('notification delivery is opt-in, baselined and disabled in Apps Script until production rollout', () => {
  const dispatch = read('NotificationDispatchService.gs');
  const service = read('server/services/notification-dispatch-service.js');
  const preferences = read('server/repositories/notification-preference-repository.js');
  assert.match(dispatch, /NOTIFICATION_DISPATCH_ENABLED/);
  assert.match(dispatch, /Notification dispatch is disabled/);
  assert.match(dispatch, /replace\(\/\\\/\+\$\/, ''\) \+ '\/'/);
  assert.match(dispatch, /method: 'post'/);
  assert.match(service, /notification-dispatch-baseline-v1/);
  assert.match(service, /Daily digest is scheduled at 12:00/);
  assert.match(preferences, /notification-preference:/);
  assert.match(preferences, /notification_rule_states/);
});

test('notification center aggregates yesterday Fund income and expense by exact detail date', async () => {
  let requestedDate = '';
  const service = createNotificationCenterService({
    repository: { find: async (_config, dateKey) => {
      requestedDate = dateKey;
      return {
        trip: null, operations: null, fund: null, syncStatuses: [], writeJobs: [],
        dailySummary: { payload: { date: '2026-08-12', displayDate: '12/08/2026', trips: 8, revenue: 12000000, fuelExpense: 3000000, fuelAvailable: true, salaryExpense: 1800000, salaryAvailable: true, vehicleCount: 3, volume: 90, projectCount: 2 }, synced_at: '2026-08-13T04:58:00.000Z' },
        dailyFundSummary: { payload: {
          incomeCategories: [{ category: 'Doanh thu', details: [{ date: '2026-08-12', amount: 5000000 }, { date: '2026-08-11', amount: 1000000 }] }],
          expenseCategories: [
            { category: 'Xăng dầu', details: [{ date: '2026-08-12', amount: 3000000 }] },
            { category: 'Thuế TNDN', details: [{ date: '2026-08-12', amount: 400000 }] },
            { category: 'Thuế VAT', details: [{ date: '2026-08-12', amount: 300000 }] },
            { category: 'Phí đi đường', details: [{ date: '2026-08-12', amount: 200000 }] },
            { category: 'Ứng lương', details: [{ date: '2026-08-12', amount: 100000 }] },
            { category: 'Trả nợ', details: [{ date: '2026-08-12', amount: 900000 }] },
            { category: 'Phí khác', details: [{ date: '2026-08-12', amount: 2000000 }] }
          ]
        }, synced_at: '2026-08-13T04:57:00.000Z' }
      };
    } },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-13T05:00:00.000Z')
  });
  const result = await service.list({});
  assert.equal(requestedDate, '2026-08-12');
  assert.equal(result.dailySummary.fundAvailable, true);
  assert.equal(result.dailySummary.fuelExpense, 3000000);
  assert.equal(result.dailySummary.fuelAvailable, true);
  assert.equal(result.dailySummary.salaryExpense, 1800000);
  assert.equal(result.dailySummary.salaryAvailable, true);
  assert.equal(result.dailySummary.fundIncome, 5000000);
  assert.equal(result.dailySummary.fundExpense, 2000000);
  assert.equal(result.dailySummary.fundFuelExpense, 3000000);
  assert.equal(result.dailySummary.fundExcludedExpense, 4900000);
  assert.equal(result.dailySummary.fundGrossExpense, 6900000);
  assert.equal(result.dailySummary.fundNet, -1900000);
  assert.equal(result.dailySummary.grossProfitAvailable, true);
  assert.equal(result.dailySummary.grossProfit, 5200000);
});

test('notification center keeps canceled write jobs out of system error alerts', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, syncStatuses: [],
      writeJobs: [{
        id: 'job-canceled', module: 'transport', action: 'submitRows', status: 'failed', attempts: 3,
        last_error: 'CANCELED_BY_OPERATOR: Đã hủy để tránh ghi trùng.', updated_at: '2026-08-13T04:00:00.000Z'
      }]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-13T05:00:00.000Z')
  });
  const result = await service.list({});
  assert.equal(result.items.some((item) => item.id.includes('job-canceled')), false);
  assert.equal(result.items.some((item) => item.type === 'write-failure'), false);
});

test('Apps Script dispatch normalizes the trailing slash and preserves POST', () => {
  const request = {};
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => ({
      NOTIFICATION_DISPATCH_ENABLED: 'true',
      NOTIFICATION_DISPATCH_URL: 'https://dongbac.vercel.app/api/notification-dispatch',
      NOTIFICATION_DISPATCH_SECRET: 'test-secret'
    })[key] || '' }) },
    UrlFetchApp: { fetch: (url, options) => {
      request.url = url;
      request.options = options;
      return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
    } }
  };
  vm.runInNewContext(read('NotificationDispatchService.gs'), sandbox);
  const result = sandbox.NotificationDispatchService.dispatch({ nowISOString: () => '2026-08-13T00:00:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(request.url, 'https://dongbac.vercel.app/api/notification-dispatch/');
  assert.equal(request.options.method, 'post');
});

test('notification API remains authenticated, shareholder-readable and Supabase-only', () => {
  const proxy = read('api/app.js');
  const policy = read('server/services/authorization-policy.js');
  const service = read('server/services/notification-center-service.js');
  const repository = read('server/repositories/notification-bundle-repository.js');
  assert.match(proxy, /getAuthenticatedUser\(req, config\)/);
  assert.match(policy, /'getNotifications'/);
  assert.match(service, /action === 'getNotifications'/);
  assert.match(repository, /manage_data_bundles/);
  assert.doesNotMatch(service + repository, /appsScriptClient|APPS_SCRIPT_URL/);
});

test('notification center identifies active sync source, expires old incidental failures and keeps critical workers stale', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'refresh_queue_deferred:transport', status: 'error', message: 'old lock', updated_at: '2026-08-11T00:00:00.000Z' },
        { sync_key: 'recent_incidental', status: 'error', message: 'recent error', updated_at: '2026-08-13T00:30:00.000Z' },
        { sync_key: 'notification_pipeline', status: 'error', message: 'old pipeline error', updated_at: '2026-08-11T00:00:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-13T01:00:00.000Z')
  });
  const result = await service.list({});
  assert.equal(result.items.some((item) => item.message.includes('old lock')), false);
  const recent = result.items.find((item) => item.type === 'sync-failure');
  assert.equal(recent.title, 'Tác vụ đồng bộ hệ thống gặp lỗi');
  assert.match(recent.message, /Tác vụ đồng bộ hệ thống · Trạng thái: vẫn đang lỗi \(30 phút trước\)/);
  assert.match(recent.message, /tự mất khi lượt đồng bộ kế tiếp thành công/);
  const critical = result.items.find((item) => item.type === 'sync-stale');
  assert.equal(critical.type, 'sync-stale');
  assert.equal(critical.title, 'Pipeline thông báo đã gián đoạn');
  assert.doesNotMatch(critical.message, /notification_pipeline|old pipeline error/);
});

test('notification center never exposes technical pipeline payloads or URLs to push content', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [{
        sync_key: 'notification_pipeline', status: 'error',
        message: '[{"error":"Address unavailable: https://secret.supabase.co/rest/v1/manage_data_bundles"}]',
        updated_at: '2026-09-01T10:00:00.000Z'
      }]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-09-01T10:01:00.000Z')
  });
  const result = await service.list({});
  const item = result.items.find((entry) => entry.notificationKey === 'system-health');
  assert.equal(item.title, 'Pipeline thông báo gặp lỗi');
  assert.match(item.message, /Pipeline thông báo · Trạng thái: vẫn đang lỗi/);
  assert.doesNotMatch(item.message, /https:|supabase|Address unavailable|\[|\{/i);
});

test('notification center removes a deferred queue failure after a newer successful refresh', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'refresh_queue_deferred:transport', status: 'error', message: 'lock timeout', updated_at: '2026-09-20T03:40:00.000Z' },
        { sync_key: 'transport_reports_manual_sheet', status: 'ok', message: 'synced', updated_at: '2026-09-20T03:45:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-09-20T03:50:00.000Z')
  });
  const result = await service.list({});
  assert.equal(result.items.some((item) => item.notificationKey === 'system-health'), false);
});

test('notification center removes an invalid payroll explanation attempt after a newer monthly sync succeeds', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'payroll_explanations:unknown', status: 'error', message: 'Tháng giải trình phải có dạng MM/YYYY.', updated_at: '2026-09-24T05:37:16.844Z' },
        { sync_key: 'payroll_explanations:09/2026', status: 'ok', message: 'Payroll explanations synced: 27.', updated_at: '2026-09-24T07:44:22.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-09-24T07:50:00.000Z')
  });
  const result = await service.list({});
  assert.equal(result.items.some((item) => item.notificationKey === 'system-health'), false);
});

test('notification center names an unresolved payroll explanation failure without exposing its raw key', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'payroll_explanations:09/2026', status: 'error', message: 'synthetic failure', updated_at: '2026-09-24T07:44:22.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-09-24T07:50:00.000Z')
  });
  const result = await service.list({});
  const item = result.items.find((entry) => entry.notificationKey === 'system-health');
  assert.equal(item.title, 'Giải trình bảng lương gặp lỗi');
  assert.match(item.message, /^Giải trình bảng lương · Trạng thái: vẫn đang lỗi/);
  assert.doesNotMatch(item.message, /payroll_explanations|synthetic failure/);
});

test('notification center keeps an unresolved deferred queue failure with a friendly source', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'refresh_queue_deferred:fund:fund_transactions', status: 'error', message: 'lock timeout', updated_at: '2026-09-20T03:45:00.000Z' },
        { sync_key: 'fund_manual_sheet', status: 'ok', message: 'older sync', updated_at: '2026-09-20T03:40:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-09-20T03:50:00.000Z')
  });
  const result = await service.list({});
  const item = result.items.find((entry) => entry.notificationKey === 'system-health');
  assert.equal(item.title, 'Hàng đợi Quỹ Thu Chi gặp lỗi');
  assert.match(item.message, /Trạng thái: vẫn đang lỗi \(5 phút trước\)/);
});

test('notification center collapses stale realtime worker dependencies into one useful alert', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-19T08:43:00.000Z' },
        { sync_key: 'trip_notifications', status: 'ok', updated_at: '2026-08-19T08:42:00.000Z' },
        { sync_key: 'operational_notifications', status: 'ok', updated_at: '2026-08-19T08:42:00.000Z' },
        { sync_key: 'notification_pipeline', status: 'ok', updated_at: '2026-08-19T08:43:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-20T03:16:00.000Z')
  });
  const result = await service.list({});
  const systemItems = result.items.filter((item) => item.notificationKey === 'system-health');
  assert.equal(systemItems.length, 1);
  assert.equal(systemItems[0].title, 'Đồng bộ tự động đã dừng');
  assert.match(systemItems[0].message, /1113 phút/);
  assert.doesNotMatch(systemItems[0].message, /realtime_cache_worker|trip_notifications|operational_notifications|notification_pipeline/);
});

test('notification center replaces stale worker noise with one authorization instruction from the external watchdog', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-19T08:43:00.000Z' },
        { sync_key: 'trip_notifications', status: 'ok', updated_at: '2026-08-19T08:42:00.000Z' },
        { sync_key: 'external_sync_watchdog', status: 'authorization_required', message: 'Authorization is required to perform that action.', updated_at: '2026-08-20T03:10:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-20T03:16:00.000Z')
  });
  const result = await service.list({});
  const systemItems = result.items.filter((item) => item.notificationKey === 'system-health');
  assert.equal(systemItems.length, 1);
  assert.equal(systemItems[0].title, 'Đồng bộ cần được cấp lại quyền');
  assert.match(systemItems[0].message, /recoverSyncInfrastructure/);
  assert.doesNotMatch(systemItems[0].message, /403|realtime_cache_worker|trip_notifications/);
});

test('notification center identifies deployment access denial without claiming OAuth revocation', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-19T08:43:00.000Z' },
        { sync_key: 'external_sync_watchdog', status: 'deployment_access_denied', message: 'Không thể truy cập Apps Script deployment.', updated_at: '2026-08-20T03:10:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-20T03:16:00.000Z')
  });
  const result = await service.list({});
  const systemItems = result.items.filter((item) => item.notificationKey === 'system-health');
  assert.equal(systemItems.length, 1);
  assert.equal(systemItems[0].title, 'Kết nối Apps Script bị chặn');
  assert.match(systemItems[0].message, /quyền truy cập deployment/);
  assert.doesNotMatch(systemItems[0].message, /OAuth|cấp lại quyền|403/);
});

test('notification center does not mislabel a transient watchdog failure as OAuth revocation', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-20T03:00:00.000Z' },
        { sync_key: 'external_sync_watchdog', status: 'error', message: 'Upstream timeout.', updated_at: '2026-08-20T03:10:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-20T03:16:00.000Z')
  });
  const result = await service.list({});
  const item = result.items.find((entry) => entry.notificationKey === 'system-health');
  assert.equal(item.title, 'Không thể tự khôi phục đồng bộ');
  assert.doesNotMatch(item.message, /cấp lại quyền/);
});

test('header uses an accessible bell and filter controls reserve a chevron gutter', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  const adaptive = read('next-shell/components/platform/AdaptiveFilterSizing.tsx');
  const center = read('next-shell/components/platform/NotificationCenter.tsx');
  const css = read('next-shell/app/platform.css');
  assert.match(shell, /<NotificationCenter userId=\{context\.user\.id\} \/>/);
  assert.match(shell, /<AdaptiveFilterSizing \/>/);
  assert.match(adaptive, /measureText\(selectedLabel\(select\)\)/);
  assert.match(adaptive, /setProperty\('width', selectedWidth, 'important'\)/);
  assert.match(adaptive, /FILTER_INLINE_PADDING/);
  assert.doesNotMatch(shell, /aria-label="Mở Google Sheet"/);
  assert.match(center, /aria-expanded=\{open\}/);
  assert.match(center, /role="dialog"/);
  assert.match(center, /aria-live="polite"/);
  assert.match(center, />Tất cả <span>/);
  assert.match(center, />Chưa đọc <span>/);
  assert.match(center, /aria-label="Đánh dấu tất cả là đã đọc"/);
  assert.match(center, /aria-label="Làm mới thông báo"/);
  assert.doesNotMatch(center, />Đánh dấu tất cả đã đọc</);
  assert.doesNotMatch(center, />Làm mới</);
  assert.match(center, /localStorage\.setItem\(storageKey/);
  assert.match(center, /updateAppBadge\(unreadCount, items\.map/);
  assert.match(center, /function notificationKey\(item: NotificationItem\) \{\s*return item\.id;/);
  assert.match(center, /function legacyNotificationKey\(item: NotificationItem\)/);
  assert.match(center, /READ_STORAGE_VERSION = 'v2'/);
  assert.match(center, /READ_RETENTION_MS = 120 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(center, /Object\.hasOwn\(readLedger, notificationKey\(item\)\)/);
  assert.match(center, /item\.legacyIds \|\| \[\]/);
  assert.match(center, /removeItem\(legacyStorageKey\)/);
  assert.match(center, /migratedReadAt/);
  assert.match(center, /setLegacyBaselineNeeded\(!storedRaw && legacyRaw !== null\)/);
  assert.match(center, /Object\.fromEntries\(items\.map\(\(item\) => \[notificationKey\(item\), readAt\]\)\)/);
  assert.match(center, /if \(!readHydrated \|\| !loaded \|\| legacyBaselineNeeded\) return/);
  assert.match(center, /pruneReadLedger\(readLedger\)/);
  assert.doesNotMatch(center, /retainedKeys/);
  assert.doesNotMatch(center, /filter\(\(item\) => isNotificationRead\(item/);
  assert.match(center, /NOTIFICATION_REVALIDATE_MS = 60 \* 1000/);
  assert.match(center, /window\.setInterval\(refreshVisible, NOTIFICATION_REVALIDATE_MS\)/);
  assert.match(center, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.match(center, /window\.addEventListener\('focus', refreshVisible\)/);
  assert.match(read('public/sw.js'), /BADGE_STATE_CACHE/);
  assert.match(read('public/sw.js'), /unreadDelta/);
  assert.match(read('public/sw.js'), /preserveBadge/);
  assert.match(center, /COPY_LONG_PRESS_MS = 550/);
  assert.match(center, /Nhấn giữ để sao chép nội dung/);
  assert.match(center, /navigator\.clipboard\.writeText/);
  assert.match(center, /legacyCopyText\(value\)/);
  assert.match(center, /notification-copy-dialog/);
  assert.match(center, /Safari đang chặn sao chép tự động/);
  assert.match(center, /setCopyFallback\(item\)/);
  assert.match(center, /textarea\.setSelectionRange\(0, value\.length\)/);
  assert.match(center, /state\?\.triggered/);
  assert.match(center, /onPointerUp=\{\(\) => endLongPress\(item\)\}/);
  assert.doesNotMatch(center, /window\.location\.assign\(item\.url\)/);
  assert.match(center, /aria-keyshortcuts="Control\+C Meta\+C"/);
  assert.match(center, /onCopy=\{\(event\) =>/);
  assert.match(center, /event\.clipboardData\.setData\('text\/plain', notificationClipboardText\(item\)\)/);
  assert.match(center, /suppressClickRef\.current === key/);
  assert.doesNotMatch(center, /Nguồn: XL_DoiSoatChuyen/);
  assert.match(css, /padding-inline: 10px 30px !important/);
  assert.match(css, /catalog-sticky-toolbar[\s\S]*height: 44px !important/);
  assert.match(css, /\.notification-toolbar-actions \{[\s\S]*display: flex;/);
  assert.match(css, /\.notification-toolbar-icon \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
  assert.match(css, /\.notification-item-action \{[\s\S]*touch-action: pan-y;/);
  assert.match(css, /\.notification-item-action \{[\s\S]*-webkit-touch-callout: none;/);
  assert.match(css, /\.notification-backdrop:hover,[\s\S]*background: rgba\(15, 23, 42, \.18\) !important;/);
  assert.match(css, /\.notification-copy-dialog textarea \{[\s\S]*user-select: text;/);
  assert.match(css, /\.notification-item-action\.copy-pressing/);
});

test('all date controls use one final left-alignment contract including Safari native values', () => {
  const css = read('next-shell/app/platform.css');
  assert.match(css, /Final date-control contract/);
  assert.match(css, /html body \.custom-date-box \{[\s\S]*justify-content: flex-start !important;[\s\S]*text-align: left !important;/);
  assert.match(css, /html body \.custom-date-box \.date-display-text[^{}]*\{[\s\S]*width: 100% !important;[\s\S]*text-align: left !important;/);
  assert.match(css, /input\[type="date"\]::\-webkit-date-and-time-value[\s\S]*text-align: left !important;/);
  assert.match(css, /cashflow-overview-filter-panel \.cashflow-filter-stack \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 142px !important;/);
  assert.match(css, /cashflow-overview-filter-panel \.cashflow-date-input \.date-display-text \{[\s\S]*font-size: 13px !important;/);
});
