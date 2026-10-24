// Routing metadata stays on the server even in nested queue results. This
// serializer does not mutate the persisted intent used for replay checks.
const WORKBOOK_ROUTING_KEYS = new Set(['spreadsheetId', 'spreadsheet_id', 'ssId', 'transport_spreadsheet_id', 'cashflow_spreadsheet_id']);

function publicApiResponseReplacer(key, value) {
  return WORKBOOK_ROUTING_KEYS.has(key) ? undefined : value;
}

module.exports = { publicApiResponseReplacer };
