const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

class FakeCache {
  constructor() {
    this.values = new Map();
    this.ttls = new Map();
  }

  get(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  getAll(keys) {
    return Object.fromEntries(keys.filter((key) => this.values.has(key)).map((key) => [key, this.values.get(key)]));
  }

  put(key, value, ttl) {
    this.values.set(key, value);
    this.ttls.set(key, ttl);
  }

  putAll(values, ttl) {
    Object.entries(values).forEach(([key, value]) => {
      this.values.set(key, value);
      this.ttls.set(key, ttl);
    });
  }

  removeAll(keys) {
    keys.forEach((key) => {
      this.values.delete(key);
      this.ttls.delete(key);
    });
  }
}

function loadService() {
  const cache = new FakeCache();
  const context = vm.createContext({
    CacheService: { getScriptCache: () => cache }
  });
  new vm.Script(read('RuntimeCacheService.gs'), { filename: 'RuntimeCacheService.gs#test' }).runInContext(context);
  return { cache, service: context.RuntimeCacheService };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('runtime cache key construction preserves prefix, version, and normalized dimensions', () => {
  const { service } = loadService();
  assert.equal(
    service.buildKey(['ss', 'sheet_2026', 'report', 'v13'], ['overview', '2026-07']),
    'ss:sheet_2026:report:v13:overview:2026-07'
  );
});

test('chunked cache round-trips large payloads with the original TTL', () => {
  const { cache, service } = loadService();
  const payload = { text: 'x'.repeat(190000), nested: { ok: true } };
  service.putChunked('large', payload, 600);

  assert.equal(cache.get('large_count'), '3');
  assert.equal(cache.ttls.get('large_0'), 600);
  assert.equal(cache.ttls.get('large_count'), 600);
  assert.deepEqual(plain(service.getChunked('large')), payload);
});

test('rewriting a shorter payload removes stale old chunks', () => {
  const { cache, service } = loadService();
  service.putChunked('rewrite', { text: 'x'.repeat(190000) }, 600);
  service.putChunked('rewrite', { text: 'short' }, 60);

  assert.equal(cache.get('rewrite_count'), '1');
  assert.equal(cache.get('rewrite_1'), null);
  assert.equal(cache.get('rewrite_2'), null);
  assert.deepEqual(plain(service.getChunked('rewrite')), { text: 'short' });
});

test('missing chunks and invalid JSON keep returning null', () => {
  const { cache, service } = loadService();
  service.putChunked('missing', { text: 'x'.repeat(100000) }, 600);
  cache.removeAll(['missing_1']);
  assert.equal(service.getChunked('missing'), null);

  cache.put('invalid_count', '1', 60);
  cache.put('invalid_0', '{bad json', 60);
  assert.equal(service.getChunked('invalid'), null);
  assert.equal(service.getChunked('absent'), null);
});

test('single and batch invalidation remove count and every stored chunk', () => {
  const { cache, service } = loadService();
  service.putChunked('one', { text: 'x'.repeat(100000) }, 60);
  service.putChunked('two', { ok: true }, 60);
  service.removeChunkedMany(['one', 'two']);

  assert.equal(cache.get('one_count'), null);
  assert.equal(cache.get('one_0'), null);
  assert.equal(cache.get('one_1'), null);
  assert.equal(cache.get('two_count'), null);
  assert.equal(cache.get('two_0'), null);
});

test('SheetService keeps compatibility wrappers and delegates runtime cache implementation', () => {
  const source = read('SheetService.gs');
  assert.match(source, /function putChunkedCache_\(key, data, ttlSeconds\) \{\s*return RuntimeCacheService\.putChunked\(key, data, ttlSeconds\);\s*\}/);
  assert.match(source, /function getChunkedCache_\(key\) \{\s*return RuntimeCacheService\.getChunked\(key\);\s*\}/);
  assert.match(source, /function removeChunkedCache_\(key\) \{\s*return RuntimeCacheService\.removeChunked\(key\);\s*\}/);
  assert.match(source, /RuntimeCacheService\.removeChunkedMany/);
  assert.doesNotMatch(source, /var chunkSize = 90000/);
  assert.doesNotMatch(source, /CacheService\.getScriptCache\(\).*key \+ '_count'/s);
});
