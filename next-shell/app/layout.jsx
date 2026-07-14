import './accounts.css';
import './platform.css';
import './c2-golden.css';
import { AppShell } from '../components/platform/AppShell';
import { LoginGate } from '../components/platform/SessionControls';
import { WorkbookContextProvider } from '../components/platform/WorkbookContextProvider';
import { loadPlatformContext } from '../lib/request-context';
import { logPlatformError } from '../lib/server-observability';

export const metadata = {
  title: { default: 'Vận tải Đông Bắc', template: '%s · Vận tải Đông Bắc' },
  description: 'Nền tảng nội bộ Vận tải và Thu chi của Vận tải Đông Bắc.',
  manifest: '/manifest.json',
  icons: { icon: '/static/assets/favicon.png', apple: '/static/assets/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Đông Bắc', statusBarStyle: 'black-translucent' }
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#062e2b' };

function C2Document({ children }) {
  return <html lang="vi">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
    </head>
    <body>{children}</body>
  </html>;
}

export default async function RootLayout({ children }) {
  let context;
  try {
    context = await loadPlatformContext();
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      return <C2Document><LoginGate supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''} /></C2Document>;
    }
    logPlatformError('root-layout', error, 'bootstrap');
    throw error;
  }
  return <C2Document><WorkbookContextProvider value={context}><AppShell context={context}>{children}</AppShell></WorkbookContextProvider></C2Document>;
}
