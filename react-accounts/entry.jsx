import React from 'react';
import { createRoot } from 'react-dom/client';
import Accounts from '../next-shell/components/Accounts.jsx';

const enabled = (value) => ['1','true','yes','on'].includes(String(value || '').trim().toLowerCase());
function mountReactAccounts() {
  if (!enabled(window.__REACT_ACCOUNTS_ENABLED)) return false;
  const legacy = document.getElementById('accountsLegacyRoot');
  const target = document.getElementById('accountsReactRoot');
  if (!legacy || !target) return false;
  const bridge = {
    togglePasswordVisibility: window.togglePasswordVisibility, changeOwnPassword: window.changeOwnPassword,
    loadUsers: window.loadUsers, createUserAccount: window.createUserAccount,
    copyTemporaryPassword: window.copyTemporaryPassword
  };
  legacy.remove(); target.hidden = false;
  createRoot(target).render(<Accounts bridge={bridge} identity="" isAdmin={window.isAdminUser?.() === true}/>);
  queueMicrotask(() => window.loadAccountSettings?.());
  return true;
}
window.mountReactAccounts = mountReactAccounts;
mountReactAccounts();
