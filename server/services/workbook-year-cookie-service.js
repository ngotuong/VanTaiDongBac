const WORKBOOK_YEAR_COOKIE = 'vtdb_workbook_year';
const YEAR_PATTERN = /^20\d{2}$/;

function selectedWorkbookYearFromCookie(header = '') {
  const part = String(header).split(';').map((value) => value.trim()).find((value) => value.startsWith(`${WORKBOOK_YEAR_COOKIE}=`));
  if (!part) return '';
  try {
    const value = decodeURIComponent(part.slice(part.indexOf('=') + 1));
    return YEAR_PATTERN.test(value) ? value : '';
  } catch (_error) {
    return '';
  }
}

function workbookYearCookie(year, { secure = process.env.NODE_ENV === 'production' } = {}) {
  if (!YEAR_PATTERN.test(String(year || ''))) throw new Error('Năm workbook không hợp lệ.');
  return [
    `${WORKBOOK_YEAR_COOKIE}=${encodeURIComponent(year)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
    `Max-Age=${60 * 60 * 24 * 370}`
  ].filter(Boolean).join('; ');
}

module.exports = { WORKBOOK_YEAR_COOKIE, selectedWorkbookYearFromCookie, workbookYearCookie };
