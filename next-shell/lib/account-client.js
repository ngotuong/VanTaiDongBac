/**
 * @typedef {{user_id:string,username:string,display_name:string,role:'admin'|'operator'|'shareholder',active:boolean}} AccountUser
 * @typedef {(method:'GET'|'POST', action:string, params?:object, body?:object) => Promise<any>} AccountTransport
 */

/** @param {AccountTransport} transport */
export function createAccountClient(transport) {
  if (typeof transport !== 'function') throw new Error('Account transport is required.');
  return {
    /** @returns {Promise<{ok:boolean,users:AccountUser[]}>} */
    listUsers: () => transport('GET', 'listUsers'),
    changeOwnPassword: (currentPassword, newPassword) => transport('POST', 'changeOwnPassword', {}, { currentPassword, newPassword }),
    createUser: (payload) => transport('POST', 'createUser', {}, payload),
    updateUser: (payload) => transport('POST', 'updateUser', {}, payload),
    resetUserPassword: (userId) => transport('POST', 'resetUserPassword', {}, { userId })
  };
}
