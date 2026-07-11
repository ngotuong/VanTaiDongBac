var RuntimeCacheService = (function () {
  var CHUNK_SIZE = 90000;

  function buildKey(prefixParts, dimensionParts) {
    return (prefixParts || []).concat(dimensionParts || []).join(':');
  }

  function putChunked(key, data, ttlSeconds) {
    var cache = CacheService.getScriptCache();
    var text = JSON.stringify(data);
    var chunks = [];
    for (var i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.substring(i, i + CHUNK_SIZE));
    }

    var oldCountStr = cache.get(key + '_count');
    if (oldCountStr) {
      var oldCount = parseInt(oldCountStr, 10);
      var oldKeys = [];
      for (var o = 0; o < oldCount; o++) {
        oldKeys.push(key + '_' + o);
      }
      oldKeys.push(key + '_count');
      cache.removeAll(oldKeys);
    }

    var chunkKeys = {};
    for (var j = 0; j < chunks.length; j++) {
      chunkKeys[key + '_' + j] = chunks[j];
    }
    cache.putAll(chunkKeys, ttlSeconds);
    cache.put(key + '_count', String(chunks.length), ttlSeconds);
  }

  function getChunked(key) {
    var cache = CacheService.getScriptCache();
    var countStr = cache.get(key + '_count');
    if (!countStr) return null;
    var count = parseInt(countStr, 10);
    var keys = [];
    for (var j = 0; j < count; j++) {
      keys.push(key + '_' + j);
    }
    var retrieved = cache.getAll(keys);
    var text = '';
    for (var k = 0; k < count; k++) {
      var chunk = retrieved[key + '_' + k];
      if (!chunk) return null;
      text += chunk;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function removeChunked(key) {
    var cache = CacheService.getScriptCache();
    var countStr = cache.get(key + '_count');
    if (countStr) {
      var count = parseInt(countStr, 10);
      var keys = [key + '_count'];
      for (var j = 0; j < count; j++) {
        keys.push(key + '_' + j);
      }
      cache.removeAll(keys);
    }
  }

  function removeChunkedMany(keys) {
    (keys || []).forEach(function (key) {
      removeChunked(key);
    });
  }

  return {
    buildKey: buildKey,
    putChunked: putChunked,
    getChunked: getChunked,
    removeChunked: removeChunked,
    removeChunkedMany: removeChunkedMany
  };
})();
