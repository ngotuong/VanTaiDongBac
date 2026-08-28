const test = require('node:test');
const assert = require('node:assert/strict');

test('shared search matches comma-separated OR terms without accents or plate punctuation', async () => {
  const { matchesSearchQuery, splitSearchTerms } = await import('../next-shell/lib/platform/search.ts');
  assert.deepEqual(splitSearchTerms(' 20H-05602, Đỗ Quang ; 20H.06728\n'), ['20h-05602', 'do quang', '20h.06728']);
  assert.equal(matchesSearchQuery(['Quang Quân', '20H05602'], '20H-99999, 20H-05602'), true);
  assert.equal(matchesSearchQuery(['Đỗ Quang', '20H06728'], 'do quang'), true);
  assert.equal(matchesSearchQuery(['Minh Vương', '20H06728'], '20H.06728'), true);
  assert.equal(matchesSearchQuery(['Minh Vương', '20H06728'], '20H99999, Quang Quân'), false);
});
