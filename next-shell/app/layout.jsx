import './accounts.css';
import './platform.css';
import Script from 'next/script';
import { redirect } from 'next/navigation';
import { AppShell } from '../components/platform/AppShell';
import { WorkbookContextProvider } from '../components/platform/WorkbookContextProvider';
import { loadPlatformContext } from '../lib/request-context';
import { logPlatformError } from '../lib/server-observability';

export const metadata = { title: { default: 'Vận tải Đông Bắc', template: '%s · Vận tải Đông Bắc' }, description: 'Nền tảng Next.js nội bộ của Vận tải Đông Bắc.' };

export default async function RootLayout({ children }) {
  let context;
  try {
    context = await loadPlatformContext();
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) redirect('/');
    logPlatformError('root-layout', error, 'bootstrap');
    throw error;
  }
  return <html lang="vi"><body><WorkbookContextProvider value={context}><AppShell context={context}>{children}</AppShell></WorkbookContextProvider><Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" strategy="beforeInteractive"/></body></html>;
}
