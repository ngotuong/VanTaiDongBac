const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('OAuth public homepage describes the app and links policy pages', () => {
  const source = read('public/oauth/index.html');
  assert.match(source, /Vận tải Đông Bắc/);
  assert.match(source, /hệ thống quản trị nội bộ/i);
  assert.match(source, /href="\.\/privacy\.html"/);
  assert.match(source, /href="\.\/terms\.html"/);
  assert.match(source, /name="viewport" content="width=device-width, initial-scale=1"/);
});

test('OAuth privacy policy discloses Google data access and infrastructure processors', () => {
  const source = read('public/oauth/privacy.html');
  assert.match(source, /Google Sheets/);
  assert.match(source, /hai bản sao Google Sheets Vận tải và Thu chi/);
  assert.match(source, /Supabase/);
  assert.match(source, /Vercel/);
  assert.match(source, /Limited Use/);
  assert.match(source, /ngotuong077@gmail\.com/);
});

test('OAuth policy pages remain static and publicly link back to the homepage', () => {
  for (const file of ['privacy.html', 'terms.html']) {
    const source = read(`public/oauth/${file}`);
    assert.match(source, /href="\.\/"/);
    assert.doesNotMatch(source, /<script\b/i);
  }
});

test('Firebase Hosting is isolated to the OAuth static directory', () => {
  const config = JSON.parse(read('firebase.json'));
  assert.equal(config.hosting.public, 'public/oauth');
  assert.equal(config.hosting.cleanUrls, true);
  assert.equal(config.hosting.trailingSlash, false);
});
