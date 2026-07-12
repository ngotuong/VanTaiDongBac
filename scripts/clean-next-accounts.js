const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'next-accounts');
fs.rmSync(target, { recursive: true, force: true });
console.log('✅ Đã xóa artifact Next static cũ tại /next-accounts.');
