// Exact provider hosts: user-controlled endpoints must never become arbitrary
// server-side HTTPS requests, including when sending an older stored row.
const PROVIDERS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
function assertPushEndpoint(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('Endpoint thông báo không hợp lệ.'); }
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || url.protocol !== 'https:' ||
      !PROVIDERS.has(url.hostname) || (url.port && url.port !== '443') || url.username || url.password || url.hash || url.pathname === '/') {
    throw new Error('Endpoint thông báo không thuộc nhà cung cấp được hỗ trợ.');
  }
  return endpoint;
}
module.exports = { assertPushEndpoint };
