'use client';

export default function ErrorBoundary({ error, reset }) {
  return <main className="next-accounts-shell"><section className="platform-boundary" role="alert"><p className="platform-eyebrow">REQUEST ERROR</p><h1>Không tải được nền tảng</h1><p>{error?.message || 'Đã xảy ra lỗi ngoài dự kiến.'}</p><div className="platform-boundary-actions"><button type="button" className="primary" onClick={reset}>Thử lại</button><a className="platform-secondary-link" href="/">Về nền tảng</a></div></section></main>;
}
