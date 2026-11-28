const assert = require('node:assert/strict');
const test = require('node:test');

test('Dashboard trip date requires a real calendar date in the selected workbook year', async () => {
  const { isDashboardTripDate } = await import('../next-shell/lib/platform/dashboard-trips.ts');
  assert.equal(isDashboardTripDate('2028-02-29', '2028'), true);
  assert.equal(isDashboardTripDate('2026-02-29', '2026'), false);
  assert.equal(isDashboardTripDate('2026-11-26', '2027'), false);
  assert.equal(isDashboardTripDate('2026-11-26T00:00:00Z', '2026'), false);
});

test('Dashboard historical trips group positive counts by project and vehicle for exactly one day', async () => {
  const { aggregateDashboardTrips } = await import('../next-shell/lib/platform/dashboard-trips.ts');
  const row = (rowIndex, date, vehicle, project, count, ticket) => ({
    rowIndex, values: [date, '', vehicle, project, count, ticket]
  });
  const date = '2026-11-17';
  const rows = [
    row(8, date, 'X1', 'A', 1, '01'),
    row(7, date, 'X1', 'A', 1, '02'),
    row(6, date, 'X1', 'B', 3, null),
    row(5, '17/11/2026', ' X1 ', 'A', '1,5', '01'),
    row(4, date, 'X2', 'A', 0, '03'),
    row(3, '2026-11-18', 'X1', 'A', 99, '04')
  ];
  assert.deepEqual(aggregateDashboardTrips(rows, date), [
    { project: 'A', vehicle: 'X1', count: 3.5, ticket: '01, 02' },
    { project: 'B', vehicle: 'X1', count: 3, ticket: '-' }
  ]);
  assert.deepEqual(aggregateDashboardTrips(rows, '2026-11-16'), []);
});
