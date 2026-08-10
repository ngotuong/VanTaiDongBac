const { accessTokenFromRequest } = require('./session-cookie-service');

function createAuthService({ fetchImpl = fetch, appUserRepository, httpError }) {
  function bearerToken(req) {
    const value = String(req.headers?.authorization || '');
    return value.startsWith('Bearer ') ? value.slice(7).trim() : accessTokenFromRequest(req);
  }

  async function getAuthenticatedUser(req, config) {
    const token = bearerToken(req);
    if (!token) throw httpError(401, 'Vui lòng đăng nhập để tiếp tục.');
    if (!config.supabaseUrl || !config.supabaseUrl.startsWith('http')) throw httpError(401, 'Phiên đăng nhập không hợp lệ hoặc chưa cấu hình Supabase URL.');
    const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw httpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    const authUser = await response.json();

    const profile = appUserRepository.findActiveByUserIdWithToken
      ? await appUserRepository.findActiveByUserIdWithToken(config, authUser.id, token)
      : await appUserRepository.findActiveByUserId(config, authUser.id);
    if (!profile) throw httpError(403, 'Tài khoản này chưa được cấp quyền sử dụng hệ thống.');
    return {
      id: authUser.id,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      displayName: profile.display_name || profile.username
    };
  }

  return { getAuthenticatedUser };
}

module.exports = { createAuthService };
