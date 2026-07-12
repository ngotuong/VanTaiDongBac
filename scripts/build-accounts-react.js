const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const outdir = path.join(__dirname, '..', 'public', 'static');
fs.mkdirSync(outdir, { recursive: true });
esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', 'react-accounts', 'entry.jsx')], outfile: path.join(outdir, 'accounts-react.js'), bundle: true, minify: true, format: 'iife', target: ['es2020'], jsx: 'automatic' });
console.log('✅ React Accounts island build thành công.');
