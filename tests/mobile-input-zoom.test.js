import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const layout = fs.readFileSync(path.join(root, 'next-shell/app/layout.jsx'), 'utf8');
const platformCss = fs.readFileSync(path.join(root, 'next-shell/app/platform.css'), 'utf8');

test('viewport preserves manual zoom instead of disabling it globally', () => {
  assert.match(layout, /export const viewport = \{ width: 'device-width', initialScale: 1, themeColor:/);
  assert.doesNotMatch(layout, /maximumScale|userScalable/);
});

test('all mobile editable and selectable controls use the iOS-safe 16px minimum', () => {
  const guard = platformCss.slice(platformCss.indexOf('Mobile input zoom guard'));

  assert.match(guard, /@media \(max-width: 768px\)/);
  assert.match(guard, /input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\):not\(\[type='hidden'\]\)/);
  assert.match(guard, /html body select/);
  assert.match(guard, /html body textarea/);
  assert.match(guard, /\[contenteditable='true'\]/);
  assert.match(guard, /--platform-control-font-size: 16px/);
  assert.match(guard, /font-size: 16px !important/);
});

test('mobile zoom guard keeps the approved compact control geometry unchanged', () => {
  assert.match(platformCss, /--platform-control-height: 38px/);
  assert.doesNotMatch(
    platformCss.slice(platformCss.indexOf('Mobile input zoom guard')),
    /height:\s*16px|min-height:\s*16px|max-height:\s*16px/,
  );
});
