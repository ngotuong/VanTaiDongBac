import './accounts.css';
import Script from 'next/script';
export const metadata = { title: 'Tài khoản · Vận tải Đông Bắc' };
export default function RootLayout({ children }) { return <html lang="vi"><body>{children}<Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" strategy="beforeInteractive"/></body></html>; }
