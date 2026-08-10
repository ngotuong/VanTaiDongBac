import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores(['index.html', 'next-accounts/**', 'public/static/**', 'node_modules/**', '.next/**', '.vercel/**']),
  {
    files: ['app/**/*.{js,jsx}', 'next-shell/components/platform/**/*.{ts,tsx}', 'next-shell/lib/platform/**/*.{ts,tsx}'],
    rules: { '@next/next/no-html-link-for-pages': 'off' }
  }
]);
