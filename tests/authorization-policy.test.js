const assert = require('node:assert/strict');
const test = require('node:test');
const { createAuthorizationPolicy, SHAREHOLDER_ACTIONS } = require('../server/services/authorization-policy');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const policy = createAuthorizationPolicy({ httpError });

test('AuthorizationPolicy preserves shareholder read allowlist and deny-by-default writes', () => {
  for (const action of ['getDashboard', 'getFundTransactions', 'checkTripReconciliation', 'changeOwnPassword']) {
    assert.equal(SHAREHOLDER_ACTIONS.has(action), true);
    assert.doesNotThrow(() => policy.assertAuthorized({ role: 'shareholder' }, action));
  }
  for (const action of ['submitRows', 'getFundCatalog', 'getWriteJobStatus', 'createUser']) {
    assert.equal(SHAREHOLDER_ACTIONS.has(action), false);
    assert.throws(() => policy.assertAuthorized({ role: 'shareholder' }, action), (error) => error.status === 403 && error.message === 'Tài khoản cổ đông chỉ có quyền xem dữ liệu.');
  }
});

test('AuthorizationPolicy preserves admin/operator unrestricted business dispatch', () => {
  assert.doesNotThrow(() => policy.assertAuthorized({ role: 'admin' }, 'submitRows'));
  assert.doesNotThrow(() => policy.assertAuthorized({ role: 'operator' }, 'addFundLoan'));
  assert.doesNotThrow(() => policy.assertAuthorized(null, 'health'));
});

test('AuthorizationPolicy keeps account administration admin-only', () => {
  assert.doesNotThrow(() => policy.assertAdmin({ role: 'admin' }));
  for (const user of [{ role: 'operator' }, { role: 'shareholder' }, null]) {
    assert.throws(() => policy.assertAdmin(user), (error) => error.status === 403 && error.message === 'Chỉ quản trị viên được quản lý tài khoản.');
  }
});
