const fs = require('fs');
const path = require('path');
const source = path.join(__dirname, '..', 'next-shell', 'out');
const target = path.join(__dirname, '..', 'next-accounts');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log('✅ Next Accounts static shell đã copy vào /next-accounts.');
