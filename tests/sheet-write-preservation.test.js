const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fixture = JSON.parse(read('tests/fixtures/sheet-write-preservation.synthetic.json'));

function makeCell(value = '') {
  return { value, formulaR1C1: '', format: 'blank', validation: null, metadata: null };
}

class FakeRange {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  cells() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.cell(this.row + rowOffset, this.column + columnOffset)));
  }

  getValues() {
    return this.cells().map((row) => row.map((cell) => cell.value));
  }

  setValues(values) {
    assert.equal(values.length, this.rowCount);
    values.forEach((row, rowOffset) => {
      assert.equal(row.length, this.columnCount);
      row.forEach((value, columnOffset) => {
        const cell = this.sheet.cell(this.row + rowOffset, this.column + columnOffset);
        cell.value = value;
        cell.formulaR1C1 = '';
      });
    });
    return this;
  }

  getFormulasR1C1() {
    return this.cells().map((row) => row.map((cell) => cell.formulaR1C1));
  }

  setFormulaR1C1(formula) {
    assert.equal(this.rowCount, 1);
    assert.equal(this.columnCount, 1);
    const cell = this.sheet.cell(this.row, this.column);
    cell.formulaR1C1 = formula;
    cell.value = '';
    return this;
  }

  copyTo(target, copyPasteType, transposed) {
    assert.equal(copyPasteType, 'PASTE_FORMAT');
    assert.equal(transposed, false);
    const source = this.cells()[0];
    target.cells().forEach((row) => row.forEach((cell, columnOffset) => {
      cell.format = source[columnOffset].format;
    }));
  }
}

class FakeSheet {
  constructor(rowCount, columnCount) {
    this.columnCount = columnCount;
    this.grid = Array.from({ length: rowCount }, () =>
      Array.from({ length: columnCount }, () => makeCell()));
    this.insertions = [];
  }

  cell(row, column) {
    assert.ok(row >= 1 && column >= 1 && column <= this.columnCount);
    assert.ok(row <= this.grid.length, `Row ${row} exceeds fake sheet size ${this.grid.length}`);
    return this.grid[row - 1][column - 1];
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }

  getMaxRows() {
    return this.grid.length;
  }

  insertRowsAfter(afterPosition, howMany) {
    assert.equal(afterPosition, this.grid.length);
    this.insertions.push({ afterPosition, howMany });
    for (let index = 0; index < howMany; index += 1) {
      this.grid.push(Array.from({ length: this.columnCount }, () => makeCell()));
    }
  }
}

function applyFixtureRow(sheet, rowNumber, rowFixture) {
  rowFixture.values.forEach((value, index) => {
    Object.assign(sheet.cell(rowNumber, index + 1), {
      value,
      formulaR1C1: rowFixture.formulasR1C1[index],
      format: rowFixture.formats[index],
      validation: rowFixture.validations[index],
      metadata: rowFixture.metadata[index]
    });
  });
}

function snapshotProperties(sheet, rows, property) {
  return rows.map((row) => fixture.columns.map((_, index) => sheet.cell(row, index + 1)[property]));
}

function loadWriteHelpers() {
  const cache = new Map();
  const context = vm.createContext({
    console,
    SpreadsheetApp: { CopyPasteType: { PASTE_FORMAT: 'PASTE_FORMAT' } },
    CacheService: { getScriptCache: () => ({
      get: (key) => cache.has(key) ? cache.get(key) : null,
      put: (key, value) => cache.set(key, value)
    }) }
  });
  new vm.Script(read('SheetWritePreserver.gs'), { filename: 'SheetWritePreserver.gs#test' }).runInContext(context);
  return { cache, service: context.SheetWritePreserver };
}

const loaded = loadWriteHelpers();
const helpers = loaded.service;

test('fixture is synthetic and contains no production workbook identifier', () => {
  assert.equal(fixture.fixtureType, 'synthetic');
  assert.equal(JSON.stringify(fixture).includes('spreadsheetId'), false);
  assert.equal(fixture.columns.length, 5);
});

test('partial update preserves skipped formula column and unrelated cell state', () => {
  const sheet = new FakeSheet(3, fixture.columns.length);
  applyFixtureRow(sheet, 2, fixture.existingTargetRow);
  const beforeFormula = sheet.cell(2, 4).formulaR1C1;
  const beforeValidation = snapshotProperties(sheet, [2], 'validation');
  const beforeMetadata = snapshotProperties(sheet, [2], 'metadata');

  helpers.writeRowSkippingColumns(
    sheet,
    2,
    fixture.partialUpdate.incoming,
    fixture.partialUpdate.skippedZeroBasedColumns
  );

  assert.deepEqual(sheet.getRange(2, 1, 1, 5).getValues()[0], [
    '13/07/2026', '30A-UPDATED', 8, '', 'đã cập nhật'
  ]);
  assert.equal(sheet.cell(2, 4).formulaR1C1, beforeFormula);
  assert.deepEqual(snapshotProperties(sheet, [2], 'validation'), beforeValidation);
  assert.deepEqual(snapshotProperties(sheet, [2], 'metadata'), beforeMetadata);
});

test('append preserves an existing target formula and propagates the template formula into blank cells', () => {
  const sheet = new FakeSheet(4, fixture.columns.length);
  applyFixtureRow(sheet, 1, fixture.templateRow);
  applyFixtureRow(sheet, 2, fixture.existingTargetRow);

  helpers.writeRowsPreservingSheetState(sheet, 2, fixture.appendRows, []);

  assert.equal(sheet.cell(2, 4).formulaR1C1, '=RC[-1]*2000');
  assert.equal(sheet.cell(3, 4).formulaR1C1, '=RC[-1]*1000');
  assert.deepEqual(sheet.getRange(2, 1, 2, 5).getValues(), [
    ['11/07/2026', '30A-NEW-1', 4, '', 'append 1'],
    ['12/07/2026', '30A-NEW-2', 5, '', 'append 2']
  ]);
});

test('format copy does not overwrite formulas, validations, or metadata', () => {
  const sheet = new FakeSheet(4, fixture.columns.length);
  applyFixtureRow(sheet, 1, fixture.templateRow);
  applyFixtureRow(sheet, 2, fixture.existingTargetRow);
  const validationsBefore = snapshotProperties(sheet, [2, 3], 'validation');
  const metadataBefore = snapshotProperties(sheet, [2, 3], 'metadata');

  helpers.writeRowsPreservingSheetState(sheet, 2, fixture.appendRows, []);

  assert.deepEqual(snapshotProperties(sheet, [2, 3], 'format'), [
    fixture.templateRow.formats,
    fixture.templateRow.formats
  ]);
  assert.deepEqual(snapshotProperties(sheet, [2, 3], 'validation'), validationsBefore);
  assert.deepEqual(snapshotProperties(sheet, [2, 3], 'metadata'), metadataBefore);
});

test('nonblank incoming value is written when the target has no existing formula', () => {
  const sheet = new FakeSheet(2, fixture.columns.length);
  applyFixtureRow(sheet, 1, fixture.templateRow);
  const incoming = [fixture.appendRows[0].slice()];
  incoming[0][3] = 123456;

  helpers.writeRowsPreservingSheetState(sheet, 2, incoming, []);

  assert.equal(sheet.cell(2, 4).value, 123456);
  assert.equal(sheet.cell(2, 4).formulaR1C1, '');
});

test('ensureRows grows exactly to the required row and never shrinks the sheet', () => {
  const sheet = new FakeSheet(2, fixture.columns.length);
  helpers.ensureRows(sheet, 5);
  helpers.ensureRows(sheet, 4);

  assert.equal(sheet.getMaxRows(), 5);
  assert.deepEqual(sheet.insertions, [{ afterPosition: 2, howMany: 3 }]);
});

test('last non-empty row scans backward and preserves the optional cache contract', () => {
  const sheet = new FakeSheet(5, fixture.columns.length);
  sheet.getLastRow = () => 5;
  sheet.getName = () => 'NL_Test';
  sheet.cell(2, 1).value = 'first';
  sheet.cell(4, 1).value = 'last';

  assert.equal(helpers.getLastNonEmptyRowInColumn(sheet, 1, 2, 'lastrow:test', 300), 4);
  assert.equal(loaded.cache.get('lastrow:test'), '4');
  sheet.cell(4, 1).value = '';
  assert.equal(helpers.getLastNonEmptyRowInColumn(sheet, 1, 2, 'lastrow:test', 300), 4);
  assert.equal(helpers.getLastNonEmptyRowInColumn(sheet, 1, 2, '', 300), 2);
});

test('SheetService keeps write-preservation wrappers and no longer owns low-level implementations', () => {
  const source = read('SheetService.gs');
  assert.match(source, /SheetWritePreserver\.writeRowSkippingColumns/);
  assert.match(source, /SheetWritePreserver\.writeRowsPreservingSheetState/);
  assert.match(source, /SheetWritePreserver\.ensureRows/);
  assert.match(source, /SheetWritePreserver\.getLastNonEmptyRowInColumn/);
  assert.doesNotMatch(source, /function copyRowFormatSafely_/);
  assert.doesNotMatch(source, /function writeRowSegments_/);
});
