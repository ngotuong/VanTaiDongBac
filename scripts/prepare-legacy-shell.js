const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'index.html');
const destination = path.join(root, 'public', 'legacy-index.html');

if (!fs.existsSync(source)) throw new Error('Chưa build index.html legacy.');
fs.copyFileSync(source, destination);
console.log('Prepared public/legacy-index.html for the stabilization rewrite.');
