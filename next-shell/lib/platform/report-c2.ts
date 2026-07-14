import type { ReportCell, ReportMatrix } from './report-types';

export type ReportType = 'finance' | 'details' | 'payroll' | 'vehicles';

export function removeAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export function matrixRows(matrix: ReportMatrix | undefined) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headerIndex = rows.findIndex((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()));
  return headerIndex < 0 ? { head: [] as ReportCell[], body: [] as ReportCell[][] } : {
    head: rows[headerIndex],
    body: rows.slice(headerIndex + 1).filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()))
  };
}

export function reportMonths(matrix: ReportMatrix | undefined) {
  const { body } = matrixRows(matrix);
  return [...new Set(body.map((row) => String(row[0] ?? '').trim()).filter(Boolean))];
}

export function filterOverviewMatrix(matrix: ReportMatrix | undefined, month: string): ReportMatrix {
  const { head, body } = matrixRows(matrix);
  if (!head.length) return [];
  return [head, ...(month === 'Tất cả' ? body : body.filter((row) => String(row[0] ?? '').trim() === month))];
}

export function parseCellValue(input: unknown): number | null {
  const text = String(input ?? '').trim();
  if (!text || text === '-') return null;
  let clean = text.replace(/[đ₫\s]/g, '');
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.indexOf('.') < clean.indexOf(',') ? clean.replace(/\./g, '').replace(/,/g, '.') : clean.replace(/,/g, '');
  } else if (clean.includes(',')) {
    const parts = clean.split(',');
    clean = parts.length === 2 && parts[1].length <= 2 ? clean.replace(/,/g, '.') : clean.replace(/,/g, '');
  } else {
    const dots = (clean.match(/\./g) || []).length;
    if (dots > 1 || (dots === 1 && clean.split('.')[1]?.length === 3)) clean = clean.replace(/\./g, '');
  }
  const value = Number.parseFloat(clean);
  return Number.isNaN(value) ? null : value;
}

export function formatValueLike(value: number, sample: unknown) {
  const text = String(sample ?? '');
  if (value === 0) return '0';
  let decimals = 0;
  if (text.includes(',')) decimals = (text.split(',')[1] || '').replace(/[^0-9]/g, '').length;
  else if (text.includes('.')) {
    const last = (text.split('.')[1] || '').replace(/[^0-9]/g, '');
    if (last.length < 3) decimals = last.length;
  }
  return (text.includes('đ') || text.includes('₫') ? Math.round(value) : value).toLocaleString('vi-VN', {
    minimumFractionDigits: text.includes('đ') || text.includes('₫') ? 0 : decimals,
    maximumFractionDigits: text.includes('đ') || text.includes('₫') ? 0 : decimals
  });
}

export function stripMonthColumn(type: ReportType, head: ReportCell[], body: ReportCell[][]) {
  const hasMonth = /tháng/i.test(String(head[0] ?? '').trim());
  if (hasMonth && type !== 'details') return { head: head.slice(1), body: body.map((row) => row.slice(1)) };
  return { head: [...head], body: body.map((row) => [...row]) };
}

export function isTotalRow(row: ReportCell[]) {
  const first = removeAccents(String(row[0] ?? '').toLowerCase());
  return ['tong', 'cong', 'trung binh', 'thuc nhan', 'loi nhuan'].some((part) => first.includes(part));
}

export function appendTotal(head: ReportCell[], rows: ReportCell[][]) {
  if (!rows.length) return rows;
  const data = rows.filter((row) => !isTotalRow(row));
  const total: ReportCell[] = ['Tổng cộng'];
  for (let index = 1; index < head.length; index += 1) {
    const sample = data.find((row) => String(row[index] ?? '').trim() && String(row[index] ?? '').trim() !== '-')?.[index];
    const values = data.map((row) => parseCellValue(row[index])).filter((value): value is number => value !== null);
    total[index] = values.length ? formatValueLike(values.reduce((sum, value) => sum + value, 0), sample) : '';
  }
  return [...data, total];
}

export function filterOptions(type: ReportType, head: ReportCell[], body: ReportCell[][]) {
  const normalized = head.map((cell) => removeAccents(String(cell ?? '').toLowerCase()));
  const find = (candidates: string[], fallback = -1) => {
    const index = normalized.findIndex((label) => candidates.some((candidate) => label.includes(candidate)));
    return index < 0 ? fallback : index;
  };
  const companyIdx = type === 'vehicles' ? find(['cong ty', 'chu xe', 'nha xe', 'don vi'], 0) : find(['cong ty', 'don vi', 'bo phan', 'to doi', 'nhom', 'tuyen dung']);
  const plateIdx = type === 'vehicles' ? find(['bien so', 'bien xe', 'xe'], 1) : -1;
  const data = body.filter((row) => !isTotalRow(row));
  const unique = (index: number) => index < 0 ? [] : [...new Set(data.map((row) => String(row[index] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  return { companyIdx, plateIdx, companies: unique(companyIdx), plates: unique(plateIdx) };
}

export function matchesReportRow(row: ReportCell[], query: string) {
  const parts = query.toLowerCase().split(/[,;|]+/).map((part) => removeAccents(part.trim())).filter(Boolean);
  if (!parts.length) return true;
  const text = removeAccents(row.join(' ').toLowerCase());
  return parts.some((part) => text.includes(part));
}
