import type { ReportBundle, ReportCell, ReportMatrix } from './report-types';

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

export function normalizeMonth(input: unknown): string {
  const text = String(input ?? '').trim();
  if (!text || text === 'Tất cả' || text === 'latest') return text;

  const dmyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${m}/${y}`;
  }

  const myMatch = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (myMatch) {
    const m = myMatch[1].padStart(2, '0');
    const y = myMatch[2];
    return `${m}/${y}`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    return `${m}/${y}`;
  }

  return text;
}

export function reportMonths(matrix: ReportMatrix | undefined) {
  const { body } = matrixRows(matrix);
  return [...new Set(body.map((row) => normalizeMonth(row[0])).filter(Boolean))];
}

export function reportDataMonths(matrix: ReportMatrix | undefined) {
  const { body } = matrixRows(matrix);
  return [...new Set(body
    .filter((row) => row.slice(1).some((cell) => parseCellValue(cell) !== null))
    .map((row) => normalizeMonth(row[0]))
    .filter((month) => /^(0[1-9]|1[0-2])\/20\d{2}$/.test(month)))]
    .sort(compareReportMonths);
}

export function latestReportMonth(matrix: ReportMatrix | undefined) {
  return reportMonths(matrix).filter((month) => /^(0?[1-9]|1[0-2])\/20\d{2}$/.test(month)).at(-1) || '';
}

function monthOrdinal(input: unknown) {
  const normalized = normalizeMonth(input);
  const match = normalized.match(/^(\d{2})\/(20\d{2})$/);
  return match ? Number(match[2]) * 12 + Number(match[1]) - 1 : null;
}

export function compareReportMonths(left: unknown, right: unknown) {
  const leftOrdinal = monthOrdinal(left);
  const rightOrdinal = monthOrdinal(right);
  if (leftOrdinal === null || rightOrdinal === null) return normalizeMonth(left).localeCompare(normalizeMonth(right), 'vi');
  return leftOrdinal - rightOrdinal;
}

export function calendarMonthRange(fromMonth: unknown, toMonth: unknown) {
  const fromOrdinal = monthOrdinal(fromMonth);
  const toOrdinal = monthOrdinal(toMonth);
  if (fromOrdinal === null || toOrdinal === null || fromOrdinal > toOrdinal) return [];
  const months: string[] = [];
  for (let ordinal = fromOrdinal; ordinal <= toOrdinal; ordinal += 1) {
    const year = Math.floor(ordinal / 12);
    const month = ordinal % 12 + 1;
    months.push(`${String(month).padStart(2, '0')}/${year}`);
  }
  return months;
}

export function reportYearMonths(months: string[]) {
  const latest = [...months].map(normalizeMonth).filter((month) => monthOrdinal(month) !== null).sort(compareReportMonths).at(-1);
  const year = latest?.match(/\/(20\d{2})$/)?.[1];
  return year ? Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, '0')}/${year}`) : [];
}

export function monthsWithinRange(months: string[], fromMonth: unknown, toMonth: unknown) {
  return [...new Set(months.map(normalizeMonth))]
    .filter((month) => compareReportMonths(month, fromMonth) >= 0 && compareReportMonths(month, toMonth) <= 0)
    .sort(compareReportMonths);
}

export function reportQuarterMonths(months: string[], quarter: number) {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) return [];
  const start = (quarter - 1) * 3 + 1;
  const end = start + 2;
  return [...new Set(months.map(normalizeMonth))]
    .filter((month) => {
      const match = month.match(/^(\d{2})\/20\d{2}$/);
      const value = Number(match?.[1] || 0);
      return value >= start && value <= end;
    })
    .sort(compareReportMonths);
}

export function ensureOverviewProfitColumns(matrix: ReportMatrix | undefined): ReportMatrix {
  const { head, body } = matrixRows(matrix);
  if (head.length < 2) return [];
  const normalized = head.map(normalizedHeader);
  const find = (...labels: string[]) => normalized.findIndex((header) => labels.some((label) => header === label));
  const revenueIdx = find('tong doanh thu', 'doanh thu');
  if (revenueIdx < 0) return [head, ...body];

  const tndnIdx = find('thue tndn');
  const vatIdx = find('thue vat');
  const mainFuelIdx = find('dau quang minh', 'chi phi dau');
  const roadIdx = find('phi di duong', 'phi duong bo');
  const wardIdx = find('phi phuong');
  const outsideFuelIdx = find('dau ngoai', 'dau do ngoai');
  const salaryIdx = find('chi phi luong');
  const fundIdx = find('chi quy', 'chi quy thuc te');
  const grossIdx = find('loi nhuan gop');
  const netIdx = find('loi nhuan thuc', 'loi nhuan thuc te');
  if (grossIdx >= 0 && netIdx >= 0) return [head, ...body];

  const valueAt = (row: ReportCell[], index: number) => index < 0 ? 0 : parseCellValue(row[index]) || 0;
  const nextHead = [...head];
  if (grossIdx < 0) nextHead.push('Lợi nhuận gộp');
  if (netIdx < 0) nextHead.push('Lợi nhuận thực');
  const nextBody = body.map((row) => {
    const next = [...row];
    const gross = grossIdx >= 0
      ? valueAt(row, grossIdx)
      : valueAt(row, revenueIdx) - valueAt(row, tndnIdx) - valueAt(row, vatIdx) - valueAt(row, mainFuelIdx) - valueAt(row, roadIdx) - valueAt(row, wardIdx);
    const net = netIdx >= 0
      ? valueAt(row, netIdx)
      : gross - valueAt(row, outsideFuelIdx) - valueAt(row, salaryIdx) - valueAt(row, fundIdx);
    const sample = row[revenueIdx];
    if (grossIdx < 0) next.push(formatValueLike(gross, sample));
    if (netIdx < 0) next.push(formatValueLike(net, sample));
    return next;
  });
  return [nextHead, ...nextBody];
}

export function transposeOverviewMatrix(matrix: ReportMatrix | undefined, selectedMonths: string[], totalLabel: string): ReportMatrix {
  const { head, body } = matrixRows(ensureOverviewProfitColumns(matrix));
  if (head.length < 2 || !selectedMonths.length) return [];
  const rowsByMonth = new Map(body.map((row) => [normalizeMonth(row[0]), row]));
  const visibleMonths = selectedMonths.map(normalizeMonth);
  const result: ReportMatrix = [['Danh mục', ...visibleMonths.map((month) => `Tháng ${Number(month.slice(0, 2))}`), totalLabel]];

  for (let column = 1; column < head.length; column += 1) {
    const category = head[column];
    if (!String(category ?? '').trim()) continue;
    const values = visibleMonths.map((month) => rowsByMonth.get(month)?.[column] ?? '—');
    const numericValues = values.map(parseCellValue).filter((value): value is number => value !== null);
    const sample = values.find((value) => parseCellValue(value) !== null);
    const total = numericValues.length ? formatValueLike(numericValues.reduce((sum, value) => sum + value, 0), sample) : '';
    result.push([category, ...values, total]);
  }
  return result;
}

export function aggregateDetailMatrices(matrices: Array<ReportMatrix | undefined>): ReportMatrix {
  const valid = matrices.map(matrixRows).filter(({ head }) => head.length);
  if (!valid.length) return [];
  const result: ReportMatrix = [[...valid[0].head]];
  const rowCount = Math.max(...valid.map(({ body }) => body.length));
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const templates = valid.map(({ body }) => body[rowIndex]).filter((row): row is ReportCell[] => Boolean(row));
    if (!templates.length) continue;
    const template = [...templates[0]];
    const category = String(template[0] ?? '').trim();
    if (!category || templates.some((row) => String(row[0] ?? '').trim() !== category)) continue;
    for (let column = 1; column < Math.min(4, template.length); column += 1) {
      const sample = templates.find((row) => parseCellValue(row[column]) !== null)?.[column];
      const values = templates.map((row) => parseCellValue(row[column])).filter((value): value is number => value !== null);
      if (values.length) template[column] = formatValueLike(values.reduce((sum, value) => sum + value, 0), sample);
    }
    result.push(template);
  }
  return result;
}

function mergeMonthlyMatrices(matrices: Array<ReportMatrix | undefined>): ReportMatrix {
  const valid = matrices.map(matrixRows).filter(({ head }) => head.length);
  if (!valid.length) return [];
  return [[...valid[0].head], ...valid.flatMap(({ body }) => body.map((row) => [...row]))];
}

export function aggregateMonthlyRowMatrices(
  matrices: Array<ReportMatrix | undefined>,
  type: 'payroll' | 'vehicles',
  includedMonths: string[]
): ReportMatrix {
  const valid = matrices.map(matrixRows).filter(({ head }) => head.length);
  if (!valid.length) return [];
  const head = [...valid[0].head];
  const normalized = head.map((cell) => removeAccents(String(cell ?? '').toLowerCase()));
  const find = (labels: string[]) => normalized.findIndex((header) => labels.some((label) => header.includes(label)));
  const monthIdx = find(['thang']);
  const primaryIdx = type === 'payroll' ? find(['nhan su']) : find(['bien so', 'bien xe']);
  const keyIndexes = type === 'payroll'
    ? [primaryIdx, find(['chuc vu']), find(['cong ty', 'don vi', 'bo phan'])]
    : [find(['cong ty', 'chu xe', 'nha xe', 'don vi']), primaryIdx];
  const usableKeys = [...new Set(keyIndexes.filter((index) => index >= 0))];
  if (primaryIdx < 0 || !usableKeys.length) return mergeMonthlyMatrices(matrices);

  const allowedMonths = new Set(includedMonths.map(normalizeMonth));
  const period = includedMonths.length === 1 ? includedMonths[0] : `${includedMonths[0]}–${includedMonths.at(-1)}`;
  const rowsByKey = new Map<string, ReportCell[]>();
  for (const { body } of valid) {
    for (const sourceRow of body) {
      const rowMonth = monthIdx >= 0 ? normalizeMonth(sourceRow[monthIdx]) : '';
      if (allowedMonths.size && rowMonth && !allowedMonths.has(rowMonth)) continue;
      const primary = String(sourceRow[primaryIdx] ?? '').trim();
      if (!primary || isTotalRow([primary])) continue;
      const key = usableKeys.map((index) => removeAccents(String(sourceRow[index] ?? '').trim().toLowerCase())).join('\u001f');
      const existing = rowsByKey.get(key);
      if (!existing) {
        const first = [...sourceRow];
        if (monthIdx >= 0) first[monthIdx] = period;
        rowsByKey.set(key, first);
        continue;
      }
      for (let index = 0; index < head.length; index += 1) {
        if (index === monthIdx || usableKeys.includes(index)) continue;
        const incoming = sourceRow[index];
        const incomingNumber = parseCellValue(incoming);
        if (incomingNumber !== null) {
          const currentNumber = parseCellValue(existing[index]);
          existing[index] = formatValueLike((currentNumber ?? 0) + incomingNumber, existing[index] || incoming);
          continue;
        }
        const label = normalized[index];
        const incomingText = String(incoming ?? '').trim();
        if (!incomingText || !['ghi chu', 'noi dung', 'giai thich'].some((part) => label.includes(part))) continue;
        const currentParts = String(existing[index] ?? '').split(' · ').map((part) => part.trim()).filter(Boolean);
        if (!currentParts.includes(incomingText)) existing[index] = [...currentParts, incomingText].join(' · ');
      }
    }
  }
  return [head, ...rowsByKey.values()];
}

export function aggregateReportBundles(bundles: ReportBundle[], includedMonths: string[]): ReportBundle {
  if (!bundles.length) return {};
  const latest = bundles[bundles.length - 1];
  return {
    ...latest,
    month: includedMonths.length === 1 ? includedMonths[0] : `${includedMonths[0]}–${includedMonths.at(-1)}`,
    overview: {
      ...latest.overview,
      months: latest.overview?.months,
      details: aggregateDetailMatrices(bundles.map((bundle) => bundle.overview?.details))
    },
    payroll: aggregateMonthlyRowMatrices(bundles.map((bundle) => bundle.payroll), 'payroll', includedMonths),
    vehicles: aggregateMonthlyRowMatrices(bundles.map((bundle) => bundle.vehicles), 'vehicles', includedMonths)
  };
}

export function filterOverviewMatrix(matrix: ReportMatrix | undefined, month: string): ReportMatrix {
  const { head, body } = matrixRows(matrix);
  if (!head.length) return [];
  const targetMonth = normalizeMonth(month);
  return [head, ...(targetMonth === 'Tất cả' ? body : body.filter((row) => normalizeMonth(row[0]) === targetMonth))];
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
  if (!/^-?\d+(?:\.\d+)?$/.test(clean)) return null;
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

export function formatReportDisplayValue(type: ReportType, header: ReportCell, row: ReportCell[], index: number) {
  const text = String(row[index] ?? '').trim();
  if (!text) return '';
  const headerLabel = normalizedHeader(header);
  const categoryLabel = normalizedHeader(row[0]);
  const hasCurrencyUnit = /(?:₫|đ)\s*$/i.test(text);
  let isMoney = hasCurrencyUnit;

  if (index > 0 && !headerLabel.includes('giai thich') && !headerLabel.includes('noi dung')) {
    if (type === 'finance') {
      isMoney = isMoney || !categoryLabel.includes('khoi luong');
    } else if (type === 'details') {
      isMoney = isMoney || (!categoryLabel.includes('khoi luong') && [
        'doanh thu', 'thue', 'chi phi', 'phi di duong', 'loi nhuan', 'chi quy'
      ].some((part) => categoryLabel.includes(part)));
    } else if (type === 'payroll') {
      isMoney = isMoney || [
        'luong chuyen', 'luong cung', 'tong luong', 'ung luong', 'thuc nhan', 'thuong', 'phat'
      ].some((part) => headerLabel.includes(part));
    } else if (type === 'vehicles') {
      isMoney = isMoney || [
        'doanh thu', 'tien dau', 'chi phi', 'lai gop', 'loi nhuan', 'don gia'
      ].some((part) => headerLabel.includes(part));
    }
  }

  if (isMoney) {
    const value = parseCellValue(text);
    if (value !== null) return Math.round(value).toLocaleString('vi-VN');
  }
  return text.replace(/\s*(?:₫|đ)\s*$/i, '');
}

export function stripMonthColumn(type: ReportType, head: ReportCell[], body: ReportCell[][]) {
  const hasMonth = /tháng/i.test(String(head[0] ?? '').trim());
  if (hasMonth && type !== 'details') return { head: head.slice(1), body: body.map((row) => row.slice(1)) };
  return { head: [...head], body: body.map((row) => [...row]) };
}

export function isTotalRow(row: ReportCell[]) {
  const first = removeAccents(String(row[0] ?? '').toLowerCase());
  return ['tong', 'cong', 'trung binh', 'thuc nhan', 'loi nhuan'].some((part) => first === part || first.startsWith(`${part} `));
}

export function reportSourceRows(type: ReportType, rows: ReportCell[][]) {
  return type === 'details' || type === 'finance' ? rows : rows.filter((row) => !isTotalRow(row));
}

export function appendTotal(head: ReportCell[], rows: ReportCell[][]) {
  if (!rows.length) return rows;
  const data = rows.filter((row) => !isTotalRow(row));
  const total: ReportCell[] = ['Tổng cộng'];
  for (let index = 1; index < head.length; index += 1) {
    const label = removeAccents(String(head[index] ?? '').toLowerCase());
    if (label.includes('bien so') || label.includes('bien xe')) {
      const plates = new Set(data.map((row) => String(row[index] ?? '').trim()).filter(Boolean));
      total[index] = plates.size ? `${plates.size} xe` : '';
      continue;
    }
    if (label === 'chuc vu') {
      total[index] = `${data.length} nhân sự`;
      continue;
    }
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
  const jobIdx = type === 'payroll' ? find(['chuc vu']) : -1;
  const data = body.filter((row) => !isTotalRow(row));
  const unique = (index: number) => index < 0 ? [] : [...new Set(data.map((row) => String(row[index] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  return { companyIdx, plateIdx, jobIdx, companies: unique(companyIdx), plates: unique(plateIdx), jobs: unique(jobIdx) };
}

export function matchesReportRow(row: ReportCell[], query: string) {
  const parts = query.toLowerCase().split(/[,;|]+/).map((part) => removeAccents(part.trim())).filter(Boolean);
  if (!parts.length) return true;
  const text = removeAccents(row.join(' ').toLowerCase());
  return parts.some((part) => text.includes(part));
}

function normalizedHeader(value: unknown) {
  return removeAccents(String(value ?? '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizedPlate(value: unknown) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function closeEnough(actual: number, expected: number) {
  const tolerance = Math.max(1, Math.abs(expected) * 0.002);
  return Math.abs(actual - expected) <= tolerance;
}

export function repairCompanyReport(
  details: ReportMatrix | undefined,
  vehicles: ReportMatrix | undefined,
  vehicleOwners: Record<string, string> | undefined
) {
  const ownerEntries = Object.entries(vehicleOwners || {}).map(([plate, owner]) => [normalizedPlate(plate), String(owner || '').trim()] as const);
  const ownerMap = new Map(ownerEntries.filter(([plate, owner]) => plate && owner));
  if (!ownerMap.size) return { details, vehicles };

  const vehicleParsed = matrixRows(vehicles);
  const vehicleHeaders = vehicleParsed.head.map(normalizedHeader);
  const companyIdx = vehicleHeaders.findIndex((header) => header.includes('cong ty'));
  const plateIdx = vehicleHeaders.findIndex((header) => header.includes('bien so') || header === 'xe');
  const volumeIdx = vehicleHeaders.findIndex((header) => header.includes('tong khoi') || header.includes('khoi luong'));
  const revenueIdx = vehicleHeaders.findIndex((header) => header.includes('doanh thu'));
  if (companyIdx < 0 || plateIdx < 0 || volumeIdx < 0 || revenueIdx < 0) return { details, vehicles };

  const repairedVehicleBody = vehicleParsed.body.map((row) => {
    const copy = [...row];
    const owner = ownerMap.get(normalizedPlate(row[plateIdx]));
    if (owner && !isTotalRow(row)) copy[companyIdx] = owner;
    return copy;
  });
  const repairedVehicles: ReportMatrix = [vehicleParsed.head, ...repairedVehicleBody];

  const companyTotals = new Map<string, { volume: number; revenue: number }>();
  for (const row of repairedVehicleBody) {
    if (isTotalRow(row)) continue;
    const company = String(row[companyIdx] ?? '').trim();
    if (!company || !ownerMap.has(normalizedPlate(row[plateIdx]))) continue;
    const totals = companyTotals.get(company) || { volume: 0, revenue: 0 };
    totals.volume += parseCellValue(row[volumeIdx]) || 0;
    totals.revenue += parseCellValue(row[revenueIdx]) || 0;
    companyTotals.set(company, totals);
  }

  const detailParsed = matrixRows(details);
  const detailHeaders = detailParsed.head.map(normalizedHeader);
  const totalIdx = detailHeaders.findIndex((header) => header === 'tong');
  const quangQuanIdx = detailHeaders.findIndex((header) => header.includes('quang quan'));
  const minhVuongIdx = detailHeaders.findIndex((header) => header.includes('minh vuong'));
  if (totalIdx < 0 || quangQuanIdx < 0 || minhVuongIdx < 0) return { details, vehicles: repairedVehicles };

  const categoryIndex = new Map(detailParsed.body.map((row, index) => [normalizedHeader(row[0]), index]));
  const volumeRowIdx = categoryIndex.get('tong khoi luong');
  const revenueRowIdx = categoryIndex.get('tong doanh thu');
  if (volumeRowIdx === undefined || revenueRowIdx === undefined) return { details, vehicles: repairedVehicles };

  const totalVolume = parseCellValue(detailParsed.body[volumeRowIdx][totalIdx]) || 0;
  const totalRevenue = parseCellValue(detailParsed.body[revenueRowIdx][totalIdx]) || 0;
  const splitVolume = [...companyTotals.values()].reduce((sum, value) => sum + value.volume, 0);
  const splitRevenue = [...companyTotals.values()].reduce((sum, value) => sum + value.revenue, 0);
  const currentSplit = (parseCellValue(detailParsed.body[volumeRowIdx][quangQuanIdx]) || 0)
    + (parseCellValue(detailParsed.body[volumeRowIdx][minhVuongIdx]) || 0);
  if (currentSplit > 0 || totalVolume <= 0 || totalRevenue <= 0 || !closeEnough(splitVolume, totalVolume) || !closeEnough(splitRevenue, totalRevenue)) {
    return { details, vehicles: repairedVehicles };
  }

  const repairedDetailBody = detailParsed.body.map((row) => [...row]);
  const companyColumns = [
    { name: 'Quang Quân', index: quangQuanIdx },
    { name: 'Minh Vương', index: minhVuongIdx }
  ];
  const setValue = (rowIndex: number | undefined, columnIndex: number, value: number) => {
    if (rowIndex === undefined) return;
    const row = repairedDetailBody[rowIndex];
    const sample = row[columnIndex] || row[totalIdx];
    const formatted = formatValueLike(value, sample);
    row[columnIndex] = /[đ₫]/.test(String(sample)) && !/[đ₫]/.test(formatted) ? `${formatted} ₫` : formatted;
  };

  for (const company of companyColumns) {
    const totals = companyTotals.get(company.name) || { volume: 0, revenue: 0 };
    const preVat = totals.revenue / 1.08;
    const taxTndn = preVat * 0.1;
    const taxVat = preVat * 0.08;
    setValue(volumeRowIdx, company.index, totals.volume);
    setValue(revenueRowIdx, company.index, totals.revenue);
    setValue(categoryIndex.get('doanh thu chua vat'), company.index, preVat);
    setValue(categoryIndex.get('thue tndn'), company.index, taxTndn);
    setValue(categoryIndex.get('thue vat'), company.index, taxVat);

    const grossRowIdx = categoryIndex.get('loi nhuan gop');
    const fuelRows = repairedDetailBody
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => normalizedHeader(row[0]) === 'chi phi dau');
    const fuel = fuelRows.length ? parseCellValue(fuelRows[0].row[company.index]) || 0 : 0;
    setValue(grossRowIdx, company.index, totals.revenue - taxTndn - taxVat - fuel);
  }

  // Đảm bảo Báo Cáo Chi Tiết luôn có dòng "Lợi nhuận thực" ở cuối bảng
  const updatedCategoryIndex = new Map(repairedDetailBody.map((row, index) => [normalizedHeader(row[0]), index]));
  const grossRowIdx = updatedCategoryIndex.get('loi nhuan gop');
  if (grossRowIdx !== undefined) {
    const rowsAfterGross = repairedDetailBody.slice(grossRowIdx + 1).filter((r) => {
      const h = normalizedHeader(r[0]);
      return h !== 'loi nhuan thuc' && h !== 'loi nhuan thuc te';
    });

    const computeNet = (cIdx: number) => {
      const gross = parseCellValue(repairedDetailBody[grossRowIdx][cIdx]) || 0;
      const deductions = rowsAfterGross.reduce((sum, r) => sum + (parseCellValue(r[cIdx]) || 0), 0);
      return gross - deductions;
    };

    const netTotal = computeNet(totalIdx);

    const existingNetIdx = updatedCategoryIndex.get('loi nhuan thuc') ?? updatedCategoryIndex.get('loi nhuan thuc te');
    const netRow: ReportCell[] = existingNetIdx !== undefined ? [...repairedDetailBody[existingNetIdx]] : new Array(detailParsed.head.length).fill('');
    netRow[0] = 'Lợi nhuận thực';

    const setRowVal = (cIdx: number, val: number) => {
      const sample = repairedDetailBody[grossRowIdx][cIdx];
      const formatted = formatValueLike(val, sample);
      netRow[cIdx] = /[đ₫]/.test(String(sample)) && !/[đ₫]/.test(formatted) ? `${formatted} ₫` : formatted;
    };

    setRowVal(totalIdx, netTotal);
    netRow[quangQuanIdx] = '';
    netRow[minhVuongIdx] = '';

    const expIdx = detailHeaders.findIndex((h) => h.includes('giai thich') || h.includes('noi dung'));
    if (expIdx >= 0) {
      netRow[expIdx] = 'Lợi nhuận gộp - chi dầu ngoài - chi phí lương - chi quỹ';
    }

    if (existingNetIdx !== undefined) {
      repairedDetailBody[existingNetIdx] = netRow;
    } else {
      repairedDetailBody.push(netRow);
    }
  }

  return { details: [detailParsed.head, ...repairedDetailBody] as ReportMatrix, vehicles: repairedVehicles };
}
