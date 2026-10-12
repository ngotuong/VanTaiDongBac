const crypto = require('node:crypto');

const FUND_ACTIONS = new Set([
  'addFundTransactions', 'updateFundTransaction', 'deleteFundTransaction', 'addFundDebtPayment',
  'addFundLoan', 'addFundLoanPayment', 'saveFundCatalogItem', 'deleteFundCatalogItem', 'updateFundSettings'
]);
const TRANSPORT_ACTIONS = new Set(['submitRows', 'saveSheetRow', 'deleteSheetRow']);

function createWriteCommandService({ repository, workbookContextService, httpError, send }) {
  const handles = (action) => FUND_ACTIONS.has(action) || TRANSPORT_ACTIONS.has(action);
  async function handle(action, req, res, config, user) {
    if (config.businessWritesPaused) throw httpError(503, 'Đang bảo trì lệnh ghi; vui lòng thử lại sau.');
    if (req.method !== 'POST') throw httpError(405, 'Lệnh ghi dữ liệu chỉ chấp nhận POST.');
    const body = { ...(req.body || {}) };
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 1024 * 1024) throw httpError(413, 'Payload quá lớn.');
    delete body.action;
    delete body.params;
    const supplied = String(body.clientRequestId || '').trim();
    if (supplied.length > 160 || (supplied && !/^[A-Za-z0-9._:-]+$/.test(supplied))) throw httpError(400, 'clientRequestId không hợp lệ.');
    const requestKey = supplied || `web-${Date.now()}-${crypto.randomUUID()}`;
    const idempotencyKey = `${action}:${requestKey}`;
    const moduleName = FUND_ACTIONS.has(action) ? 'fund' : 'transport';
    const payload = { ...body };
    if (action === 'saveSheetRow' && payload.sheetName === 'NL_VanChuyen') {
      for (const [header, value] of Object.entries(payload.rowData || {})) {
        if (!['Khối lượng', 'Khối lượng thực tế', 'Khối lượng (m³)', 'Khối lượng thực tế (m³)'].includes(header.trim())) continue;
        if (value === undefined || value === null || String(value).trim() === '') continue;
        if (!['number', 'string'].includes(typeof value) || !/^\d+(\.\d+)?$/.test(String(value).trim()) || !Number.isFinite(Number(value)) || Number(value) <= 0) {
          throw httpError(400, 'Khối lượng phải để trống hoặc là số hữu hạn lớn hơn 0.');
        }
      }
    }
    delete payload.clientRequestId;
    // Actor is server supplied, never accepted from the browser. Persist it as
    // part of the immutable intent so another user cannot reuse its key.
    delete payload.requestActorId;
    if (user?.id) payload.requestActorId = user.id;
    for (const key of ['rows', 'transactions']) {
      if (Array.isArray(payload[key]) && payload[key].length > 100) throw httpError(400, 'Mỗi lệnh ghi tối đa 100 dòng.');
    }
    if (['updateFundTransaction', 'deleteFundTransaction', 'addFundDebtPayment'].includes(action)) {
      const expected = action === 'updateFundTransaction' ? payload.transaction?.expectedTransaction : payload.expectedTransaction;
      if (!Number.isInteger(Number(payload.rowIndex)) || Number(payload.rowIndex) < 2 || !expected?.voucher || !expected?.date || !expected?.type || !expected?.category || !(Number(expected.amount) > 0)) throw httpError(400, 'Thiếu dấu vân tay giao dịch hoặc số dòng hợp lệ.');
    }
    const amounts = action === 'addFundTransactions' ? payload.transactions : action === 'updateFundTransaction' ? [payload.transaction] : ['addFundDebtPayment', 'addFundLoanPayment'].includes(action) ? [payload.payment] : action === 'addFundLoan' ? [payload.loan] : [];
    if (!Array.isArray(amounts) || amounts.some((item) => !Number.isFinite(Number(item?.amount)) || Number(item.amount) <= 0 || Number(item.amount) > Number.MAX_SAFE_INTEGER)) throw httpError(400, 'Số tiền phải là số dương hữu hạn trong giới hạn an toàn.');
    if (action === 'addFundTransactions' && !amounts.length) throw httpError(400, 'Chưa có giao dịch để ghi.');
    const workbook = workbookContextService.resolve({
      module: moduleName === 'fund' ? 'cashflow' : 'transport',
      year: payload.year
    });
    payload.year = workbook.year;
    payload.spreadsheetId = workbook.spreadsheetId;
    const job = await repository.enqueue(config, { moduleName, action, payload, idempotencyKey });
    return send(res, 202, job);
  }
  return { handles, handle };
}

module.exports = { createWriteCommandService, FUND_ACTIONS, TRANSPORT_ACTIONS };
