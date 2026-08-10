import './accounts.css';
import './c2-golden.css';
import './notification-settings.css';
import './notification-settings-v2.css';
import './notification-settings-v3.css';
import './platform.css';
import { Suspense } from 'react';
import { AppShell } from '../components/platform/AppShell';
import { LoginGate } from '../components/platform/SessionControls';
import { StartupLoadingScreen } from '../components/platform/StartupLoadingScreen';
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

const STARTUP_LOADING_CRITICAL_CSS = `
  .startup-loading-screen{position:fixed;inset:0;z-index:3000;min-height:100dvh;display:grid;place-items:center;padding:24px 20px;box-sizing:border-box;overflow:hidden;background:linear-gradient(145deg,#f8fafc 0%,#f0fdfa 52%,#f8fafc 100%);font-family:"Be Vietnam Pro",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:1}
  .startup-loading-card{width:min(100%,420px);display:grid;justify-items:center;padding:36px;box-sizing:border-box;border:1px solid rgba(13,148,136,.17);border-radius:26px;background:rgba(255,255,255,.94);box-shadow:0 28px 70px -30px rgba(6,46,43,.32);text-align:center}
  .startup-loading-brand{display:grid;justify-items:center}
  .startup-loading-logo-wrap{width:104px;height:104px;display:grid;place-items:center;margin-bottom:20px;border:1px solid rgba(13,148,136,.2);border-radius:30px;background:#fff}
  .startup-loading-logo{display:block;width:84px;height:84px;border-radius:23px;object-fit:cover}
  .startup-loading-eyebrow{margin:0 0 7px;color:#0d9488;font-size:11px;font-weight:800;letter-spacing:.12em}
  .startup-loading-card h1{margin:0;color:#062e2b;font-size:clamp(25px,6vw,32px);line-height:1.15;letter-spacing:-.025em}
  .startup-loading-journey{position:relative;width:220px;height:22px;margin:30px 0 22px}
  .startup-loading-route{position:absolute;top:10px;left:7px;right:7px;height:2px;border-radius:999px;background:#5eead4}
  .startup-loading-stop{position:absolute;top:7px;width:8px;height:8px;box-sizing:border-box;border:2px solid #5eead4;border-radius:50%;background:#fff}
  .startup-loading-stop-start{left:1px}.startup-loading-stop-end{right:1px}
  .startup-loading-marker{position:absolute;top:4px;left:2px;z-index:2;width:14px;height:14px;box-sizing:border-box;border:3px solid #fff;border-radius:50%;background:#0d9488;animation:startup-loading-travel 1.55s cubic-bezier(.4,0,.2,1) infinite}
  .startup-loading-copy{display:grid;gap:6px}.startup-loading-copy strong{color:#0f172a;font-size:16px;line-height:1.35}.startup-loading-copy span{color:#64748b;font-size:13px;line-height:1.5}
  .startup-loading-source{min-height:28px;display:inline-flex;align-items:center;gap:8px;margin-top:22px;padding:5px 10px;box-sizing:border-box;border:1px solid rgba(13,148,136,.14);border-radius:999px;color:#475569;background:#f0fdfa;font-size:11px;font-weight:650}
  .startup-loading-source-dot{width:7px;height:7px;border-radius:50%;background:#10b981}
  @keyframes startup-loading-travel{0%{opacity:.45;transform:translate3d(0,0,0) scale(.86)}18%,82%{opacity:1}100%{opacity:.45;transform:translate3d(202px,0,0) scale(.86)}}
  @media(max-width:640px){.startup-loading-screen{padding:18px 14px}.startup-loading-card{width:min(100%,360px);padding:28px 22px;border-radius:22px}}
  @media(prefers-reduced-motion:reduce){.startup-loading-marker{animation-duration:.01ms!important;opacity:1;transform:translate3d(101px,0,0)}}
`;

function C2Document({ children }) {
  return <html lang="vi">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style id="startup-loading-critical" dangerouslySetInnerHTML={{ __html: STARTUP_LOADING_CRITICAL_CSS }} />
    </head>
    <body>{children}</body>
  </html>;
}

async function AuthenticatedPlatform({ children }) {
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
  return <WorkbookContextProvider value={context}><AppShell context={context}>{children}</AppShell></WorkbookContextProvider>;
}

export default function RootLayout({ children }) {
  return <C2Document>
    <Suspense fallback={<StartupLoadingScreen />}>
      <AuthenticatedPlatform>{children}</AuthenticatedPlatform>
    </Suspense>
  </C2Document>;
}
