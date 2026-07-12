const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

function createAppsScriptClient({ fetchImpl = fetch, maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  async function forward({ url, action, method, params, body, proxySecret, requestUser }) {
    const payload = JSON.stringify({ action, method, params, body, proxySecret, requestUser });
    if (Buffer.byteLength(payload, 'utf8') > maxBodyBytes) {
      return { status: 413, body: { ok: false, error: 'Payload quá lớn.' } };
    }
    const upstream = await fetchImpl(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: payload
    });
    const text = await upstream.text();
    if (!upstream.ok) return { status: 502, body: { ok: false, error: `Apps Script trả status ${upstream.status}.` } };
    let data;
    try { data = JSON.parse(text); } catch (error) {
      return { status: 502, body: { ok: false, error: 'Apps Script trả dữ liệu không hợp lệ.' } };
    }
    return { status: data && data.ok === false ? 400 : 200, body: data };
  }
  return { forward };
}

module.exports = { createAppsScriptClient, DEFAULT_MAX_BODY_BYTES };
