const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('C2 serves the conventional favicon request without duplicating the icon asset', () => {
  const route = read('app/favicon.ico/route.ts');
  assert.match(route, /Response\.redirect/);
  assert.match(route, /\/static\/assets\/favicon\.png/);
  assert.match(route, /307/);
});
