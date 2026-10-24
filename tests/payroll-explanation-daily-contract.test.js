const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/payroll-explanation-daily-mixed-audit.json'), 'utf8'));

const parseDate = (value) => {
  const [day, month, year] = value.split('/').map(Number);
  return Date.UTC(year, month - 1, day);
};

function selectRate(type, group, threshold, month, bands = fixture.rateBands) {
  const at = parseDate(`01/${month}`);
  const candidates = bands.filter((band) => band.type === type
    && band.group === group
    && band.from <= threshold
    && parseDate(band.effectiveFrom) <= at
    && (!band.effectiveTo || parseDate(band.effectiveTo) >= at));
  candidates.sort((left, right) => right.from - left.from);
  return candidates[0]?.rate ?? null;
}

function explain(sample, bands = fixture.rateBands) {
  const threshold = sample.vehicleTrips + sample.operationsKpiAdjustment;
  const oneRate = selectRate('1_LAI', sample.group, threshold, fixture.month, bands);
  const multiRate = selectRate('NHIEU_LAI', sample.group, threshold, fixture.month, bands);
  const unknownRows = sample.dailyRows.filter((row) => !(row.driverCount >= 1));
  const oneRows = sample.dailyRows.filter((row) => row.driverCount === 1);
  const multiRows = sample.dailyRows.filter((row) => row.driverCount > 1);
  const sumTrips = (rows) => rows.reduce((sum, row) => sum + row.trips, 0);
  const oneTrips = sumTrips(oneRows);
  const multiTrips = sumTrips(multiRows);
  return {
    threshold,
    oneDays: oneRows.length,
    oneTrips,
    oneRate,
    oneSalary: oneRate == null ? null : oneTrips * oneRate,
    multiDays: multiRows.length,
    multiTrips,
    multiRate,
    multiSalary: multiRate == null ? null : multiTrips * multiRate,
    unknownTrips: sumTrips(unknownRows)
  };
}

test('Step D-A reproduces the authoritative mixed salary from daily evidence', () => {
  const result = explain(fixture.sample);
  const expected = fixture.sample.expected;
  assert.equal(result.threshold, fixture.sample.rateThreshold);
  assert.equal(result.oneDays, expected.oneDriverDays);
  assert.equal(result.oneTrips, expected.oneDriverTrips);
  assert.equal(result.oneRate, expected.oneDriverRate);
  assert.equal(result.oneSalary, expected.oneDriverSalary);
  assert.equal(result.multiDays, expected.multiDriverDays);
  assert.equal(result.multiTrips, expected.multiDriverTrips);
  assert.equal(result.multiRate, expected.multiDriverRate);
  assert.equal(result.multiSalary, expected.multiDriverSalary);
  assert.equal(result.oneSalary + result.multiSalary, expected.authoritativeSalary);
  assert.equal(result.unknownTrips, 0);
});

test('Step D-A uses vehicle trips plus KPI adjustment only for rate-band selection', () => {
  const result = explain(fixture.sample);
  assert.equal(result.threshold, 101);
  assert.equal(result.oneTrips + result.multiTrips, 62.5);
  assert.notEqual(result.threshold, result.oneTrips + result.multiTrips);
});

test('Step D-A fails closed when a daily driver count or required rate is missing', () => {
  const missingDriverCount = structuredClone(fixture.sample);
  missingDriverCount.dailyRows[0].driverCount = 0;
  assert.equal(explain(missingDriverCount).unknownTrips, 2);

  const withoutMultiRate = fixture.rateBands.filter((band) => band.type !== 'NHIEU_LAI');
  assert.equal(explain(fixture.sample, withoutMultiRate).multiSalary, null);
});

test('Step D-A audit covers both live daily-classification months without inferred trips', () => {
  assert.equal(fixture.dailyClassificationEffectiveFrom, '01/08/2026');
  assert.deepEqual(fixture.augustCohort, {
    mixedLineCount: 7,
    unknownDriverCountTripTotal: 0,
    matchedLineCount: 7,
    mismatchedLineCount: 0
  });
  assert.deepEqual(fixture.septemberCohort, {
    mixedLineCount: 12,
    unknownDriverCountTripTotal: 0,
    matchedLineCount: 12,
    mismatchedLineCount: 0
  });
});
