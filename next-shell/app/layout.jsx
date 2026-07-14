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

export default async function RootLayout({ children }) {
  let context;
  try {
    context = await loadPlatformContext();
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      return <html lang="vi"><body><LoginGate supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''} /></body></html>;
    }
    logPlatformError('root-layout', error, 'bootstrap');
    throw error;
  }
  return <html lang="vi"><body><WorkbookContextProvider value={context}><AppShell context={context}>{children}</AppShell></WorkbookContextProvider></body></html>;
}
