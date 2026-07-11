/**
 * Pure backend normalization helpers shared by Apps Script services.
 * Keep these helpers independent from Apps Script runtime services so their
 * behavior can be characterized without Spreadsheet, cache, or HTTP access.
 */
function normalizeCleanValue_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}
