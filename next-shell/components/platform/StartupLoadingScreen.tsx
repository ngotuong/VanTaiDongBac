import Image from 'next/image';

type StartupLoadingScreenProps = {
  message?: string;
  detail?: string;
};

export function StartupLoadingScreen({
  message = 'Đang khởi động ứng dụng…',
  detail = 'Đang tải cấu hình và phiên làm việc.'
}: StartupLoadingScreenProps) {
  return (
    <main
      className="startup-loading-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <section className="startup-loading-card">
        <div className="startup-loading-brand">
          <span className="startup-loading-logo-wrap" aria-hidden="true">
            <Image
              className="startup-loading-logo"
              src="/static/assets/apple-touch-icon.png"
              alt=""
              width={84}
              height={84}
              priority
            />
          </span>
          <p className="startup-loading-eyebrow">HỆ THỐNG QUẢN LÝ NỘI BỘ</p>
          <h1>Vận tải Đông Bắc</h1>
        </div>

        <div className="startup-loading-journey" aria-hidden="true">
          <span className="startup-loading-route" />
          <span className="startup-loading-marker" />
          <span className="startup-loading-stop startup-loading-stop-start" />
          <span className="startup-loading-stop startup-loading-stop-end" />
        </div>

        <div className="startup-loading-copy">
          <strong>{message}</strong>
          <span>{detail}</span>
        </div>

        <div className="startup-loading-source">
          <span className="startup-loading-source-dot" aria-hidden="true" />
          Kết nối an toàn với hệ thống dữ liệu
        </div>
      </section>
    </main>
  );
}
