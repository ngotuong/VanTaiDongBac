import type { DashboardTrip } from './dashboard-types';
import type { ManageRow } from './manage-types';

export function isDashboardTripDate(date: string, year: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || date.slice(0, 4) !== year) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function tripCount(value: unknown) {
  const text = String(value ?? '').replace(/[₫đĐ\s]/g, '');
  if (typeof value === 'number') return value;
  if (text.includes(',')) return Number(text.replace(/\./g, '').replace(',', '.').replace(/,/g, ''));
  return Number(/\.\d{3}$/.test(text) ? text.replace(/\./g, '') : text);
}

export function dashboardTripRowDate(value: unknown) {
  const text = String(value ?? '').trim();
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!local) return text;
  const [, day, month, year] = local;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function aggregateDashboardTrips(rows: ManageRow[], date: string): DashboardTrip[] {
  const groups = new Map<string, { project: string; vehicle: string; count: number; tickets: Set<string> }>();
  for (const row of [...rows].sort((left, right) => left.rowIndex - right.rowIndex)) {
    const [rowDate, , plate, name, quantity, ticket] = row.values;
    if (dashboardTripRowDate(rowDate) !== date) continue;
    const vehicle = String(plate ?? '').trim();
    const project = String(name ?? '').trim();
    const count = tripCount(quantity);
    if (!vehicle || !Number.isFinite(count) || count <= 0) continue;
    const key = JSON.stringify([project, vehicle]);
    const group = groups.get(key) ?? { project, vehicle, count: 0, tickets: new Set<string>() };
    group.count += count;
    const label = String(ticket ?? '').trim();
    if (label) group.tickets.add(label);
    groups.set(key, group);
  }
  return Array.from(groups.values(), ({ project, vehicle, count, tickets }) => ({
    project: project || '-', vehicle, count, ticket: [...tickets].join(', ') || '-'
  })).sort((left, right) => left.project.localeCompare(right.project) || right.count - left.count || left.vehicle.localeCompare(right.vehicle));
}
