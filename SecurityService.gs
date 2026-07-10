var SecurityService = (function () {
  var AUTH_ENABLED_PROP = 'AUTH_ENFORCEMENT_ENABLED';
  var PROXY_SECRET_PROP = 'APP_PROXY_SECRET';

  function isAuthEnforced() {
    var value = String(PropertiesService.getScriptProperties().getProperty(AUTH_ENABLED_PROP) || '').trim().toLowerCase();
    return value === 'true' || value === '1' || value === 'yes' || value === 'on';
  }

  function assertProxyRequest(action, providedSecret) {
    if (String(action || '').trim() === 'health') return true;
    if (!isAuthEnforced()) return true;
    var expectedSecret = String(PropertiesService.getScriptProperties().getProperty(PROXY_SECRET_PROP) || '');
    if (!expectedSecret) throw new Error('AUTH_ENFORCEMENT_ENABLED đã bật nhưng thiếu Script Property APP_PROXY_SECRET.');
    if (!safeEquals_(expectedSecret, String(providedSecret || ''))) {
      throw new Error('Yêu cầu không được xác thực qua API proxy.');
    }
    return true;
  }

  function safeEquals_(left, right) {
    var leftBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, left, Utilities.Charset.UTF_8);
    var rightBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, right, Utilities.Charset.UTF_8);
    var diff = leftBytes.length ^ rightBytes.length;
    for (var i = 0; i < leftBytes.length; i++) diff |= leftBytes[i] ^ rightBytes[i];
    return diff === 0;
  }

  return {
    isAuthEnforced: isAuthEnforced,
    assertProxyRequest: assertProxyRequest
  };
})();

function getSecurityDeploymentStatus() {
  var props = PropertiesService.getScriptProperties();
  return {
    ok: true,
    authEnabled: String(props.getProperty('AUTH_ENABLED') || '').toLowerCase() === 'true',
    authEnforced: SecurityService.isAuthEnforced(),
    proxySecretConfigured: Boolean(props.getProperty('APP_PROXY_SECRET'))
  };
}
