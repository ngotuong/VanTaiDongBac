import Link from 'next/link';

export function PlatformHome() {
  return <main className="next-accounts-shell platform-home">
    <section className="platform-hero">
      <p className="platform-eyebrow">NEXT FOUNDATION A2</p>
      <h1>Nền tảng dùng chung đã sẵn sàng</h1>
      <p>Shell này cung cấp auth guard, phân quyền điều hướng, workbook context và API boundary. Các module nghiệp vụ vẫn được chuyển độc lập ở Phase B.</p>
      <div className="platform-actions"><Link className="platform-primary-link" href="/reports">Mở Báo cáo canary</Link><Link className="platform-secondary-link" href="/foundation">Xem request context</Link></div>
    </section>
    <section className="platform-status-grid" aria-label="Trạng thái nền tảng">
      <article><strong>Server auth</strong><span>Cookie + active allowlist</span></article>
      <article><strong>Workbook</strong><span>Module + năm đã resolve</span></article>
      <article><strong>Rollback</strong><span>Legacy `/` vẫn hoạt động</span></article>
    </section>
  </main>;
}
