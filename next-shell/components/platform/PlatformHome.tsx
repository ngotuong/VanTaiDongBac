import Link from 'next/link';

export function PlatformHome() {
  return <main className="next-accounts-shell platform-home">
    <section className="platform-hero">
      <p className="platform-eyebrow">NỀN TẢNG PRODUCTION</p>
      <h1>Vận tải và Thu chi trên một nền tảng dùng chung</h1>
      <p>Phiên đăng nhập, phân quyền điều hướng, workbook context và API boundary hiện được phục vụ trực tiếp bởi Next.js tại đường dẫn chính.</p>
      <div className="platform-actions"><Link className="platform-primary-link" href="/dashboard">Mở Tổng quan</Link><Link className="platform-secondary-link" href="/foundation">Xem request context</Link></div>
    </section>
    <section className="platform-status-grid" aria-label="Trạng thái nền tảng">
      <article><strong>Server auth</strong><span>Cookie + active allowlist</span></article>
      <article><strong>Workbook</strong><span>Module + năm đã resolve</span></article>
      <article><strong>Rollback</strong><span>Legacy deployment được giữ riêng</span></article>
    </section>
  </main>;
}
