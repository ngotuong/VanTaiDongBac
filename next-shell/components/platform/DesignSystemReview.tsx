'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemePreferenceControl } from './ThemePreferenceControl';
import { BusinessAmountSummary, BusinessBadge, BusinessButton, BusinessCard, BusinessEmptyState, BusinessFieldControl, BusinessGrid, BusinessListRow, BusinessModalContent } from './BusinessPrimitives';
import { BUSINESS_FORM_INVENTORY, FUEL_FORM, PROJECT_FORM } from '../../lib/platform/business-form-schema';
import type { BusinessForm } from '../../lib/platform/business-form-schema';
import { fuelAmountPreview, formatFuelAmountPreview } from '../../lib/platform/fuel-amount-preview';
import { formatVietnameseNumberInput } from '../../lib/platform/numeric-input';
import { colorContrast } from '../../lib/platform/color-contrast';
import styles from './design-system-review.module.css';

const TOKENS = ['--platform-bg', '--platform-surface', '--platform-surface-soft', '--platform-text', '--platform-muted', '--platform-border', '--platform-primary', '--platform-primary-strong', '--platform-on-primary', '--platform-focus', '--platform-danger'];
function Example({ label, children, forced = false }: { label: string; children: ReactNode; forced?: boolean }) {
  return <div className={styles.example}><small>{label}</small>{forced ? <div inert data-demo-state={label}>{children}</div> : children}</div>;
}
function FormExample({ schema }: { schema: BusinessForm }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const options: Record<string, string[]> = { operationGroup: ['Nhóm mẫu'], tripSalary: ['Có', 'Không'], managerBonus: ['Có', 'Không'], source: ['Nguồn mẫu'], vehicle: ['20H00000'], sourcePay: ['Tiền mặt', 'Tài khoản'] };
  const update = (key: string, value: string, numeric: boolean) => setDraft(old => ({ ...old, [key]: numeric ? formatVietnameseNumberInput(value) : value }));
  return <div className={styles.formExample}>
    <div className={styles.actions} role="group" aria-label={`Chế độ mẫu ${schema.title}`}>
      <BusinessButton variant="outline" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Thêm mới</BusinessButton>
      <BusinessButton variant="outline" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Chỉnh sửa</BusinessButton>
    </div>
    <BusinessModalContent title={`${mode === 'create' ? 'Thêm' : 'Chỉnh sửa'} ${schema.title.toLocaleLowerCase('vi-VN')}`} footer={<><BusinessButton variant="outline" onClick={() => setDraft({})}>Xóa dữ liệu mẫu</BusinessButton><BusinessButton disabled title="Trang mẫu không gửi dữ liệu">Lưu lại</BusinessButton></>}>
      <BusinessGrid>{schema.fields.map(field => <BusinessFieldControl key={field.key} field={field} value={draft[field.key] || ''} options={options[field.key]} onChange={value => update(field.key, value, field.kind === 'number')}/>)}</BusinessGrid>
      {schema.id === 'NL_Dau' ? <BusinessAmountSummary value={formatFuelAmountPreview(fuelAmountPreview(draft.liters || '', draft.price || ''))} hint="Số lít × đơn giá. Đây là số tiền dầu, chưa xác nhận đã thanh toán."/> : null}
    </BusinessModalContent>
  </div>;
}
export function DesignSystemReview() {
  const [colors, setColors] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => {
      const computed = getComputedStyle(document.documentElement);
      const values = Object.fromEntries(TOKENS.map(token => [token, computed.getPropertyValue(token).trim()]));
      const button = document.querySelector<HTMLElement>('[data-review-primary]');
      if (button) {
        const style = getComputedStyle(button);
        values['action-background'] = style.backgroundColor;
        values['action-text'] = style.color;
      }
      setColors(values);
    };
    const timeout = window.setTimeout(read, 0);
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('transitionend', read);
    return () => { clearTimeout(timeout); observer.disconnect(); document.removeEventListener('transitionend', read); };
  }, []);
  const pairs = [
    ['Chữ chính / nền', colors['--platform-text'], colors['--platform-surface']],
    ['Chữ phụ / nền', colors['--platform-muted'], colors['--platform-surface']],
    ['Nút chính', colors['action-text'], colors['action-background']],
  ];
  return <div className={styles.review} data-design-system-review>
    <p className={styles.notice}>Bản xem R7 · Dữ liệu mẫu chỉ nằm trong trang này. Không gửi lệnh lưu hoặc thanh toán.</p>
    <ThemePreferenceControl/>
    <BusinessCard title="Màu và tương phản">
      <div className={styles.swatches}>{TOKENS.map(token => <div key={token}><i style={{ background: colors[token] }} aria-hidden="true"/><code>{token}</code><small>{colors[token] || '—'}</small></div>)}</div>
      <div className={styles.contrasts}>{pairs.map(([label, fg, bg]) => {
        const ratio = fg && bg ? colorContrast(fg, bg) : null;
        return <div key={label}><span>{label}</span><strong>{ratio === null ? '—' : `${ratio.toFixed(2)}:1`}</strong>{ratio !== null && ratio < 4.5 ? <BusinessBadge tone="warning">Dưới 4.5:1</BusinessBadge> : null}</div>;
      })}</div>
    </BusinessCard>
    <BusinessCard title="Chữ, khoảng cách và hình khối">
      <div className={styles.typography}><p>Tiêu đề form · 18px / 700</p><strong>Thành tiền dầu · 16px / 700</strong><span>Nội dung và thao tác · 14px / 600</span><small>Nhãn trường có dấu tiếng Việt · 12px / 600</small></div>
      <p className={styles.note}>Nhịp 4 / 8 / 12 / 16 / 24px · Control 44px · Chữ nhập 16px · Bo control 12px, card 16px, form 18px. Chỉ lớp nổi dùng bóng đổ.</p>
    </BusinessCard>
    <BusinessCard title="Nút thao tác">
      <div className={styles.examples}>
        <Example label="Chính"><BusinessButton data-review-primary>Lưu lại</BusinessButton></Example>
        <Example label="Viền"><BusinessButton variant="outline">Hủy bỏ</BusinessButton></Example>
        <Example label="Phụ"><BusinessButton variant="secondary">Thêm dòng</BusinessButton></Example>
        <Example label="Nhẹ"><BusinessButton variant="ghost">Xem chi tiết</BusinessButton></Example>
        <Example label="Khóa"><BusinessButton disabled>Lưu lại</BusinessButton></Example>
        <Example label="Đang lưu"><BusinessButton busy>Đang lưu…</BusinessButton></Example>
      </div>
    </BusinessCard>
    <BusinessCard title="Ô nhập và trạng thái">
      <div className={styles.examples}>
        <Example label="Thường"><BusinessFieldControl field={{ key: 'normal', label: 'Số km', kind: 'number', span: 'half' }} value="" onChange={() => {}}/></Example>
        <Example label="Focus" forced><BusinessFieldControl state="focus" field={{ key: 'focus', label: 'Số km', kind: 'number', span: 'half' }} value="25" onChange={() => {}}/></Example>
        <Example label="Lỗi" forced><BusinessFieldControl field={{ key: 'error', label: 'Số lít dầu', kind: 'number', span: 'half' }} value="-1" error="Nhập số lít lớn hơn 0." onChange={() => {}}/></Example>
        <Example label="Khóa"><BusinessFieldControl disabled field={{ key: 'disabled', label: 'Đơn giá', kind: 'number', span: 'half' }} value="20.000" onChange={() => {}}/></Example>
      </div>
    </BusinessCard>
    <BusinessCard title="Trạng thái và dòng danh sách">
      <div className={styles.actions}><BusinessBadge>Đang chờ</BusinessBadge><BusinessBadge tone="success">Đã đồng bộ</BusinessBadge><BusinessBadge tone="warning">Cần kiểm tra</BusinessBadge><BusinessBadge tone="error">Không lưu được</BusinessBadge></div>
      <BusinessListRow title="Dự án mẫu" detail="25 km · Nhóm vận hành mẫu" trailing={<BusinessButton variant="ghost">Chi tiết</BusinessButton>}/>
      <BusinessListRow title="Tên dự án dài để kiểm tra cách xuống dòng và giữ đầy đủ nội dung trên màn hình nhỏ" detail="Nội dung có thể xuống dòng; thao tác vẫn nằm trong khung."/>
    </BusinessCard>
    <BusinessCard title="Trạng thái rỗng"><BusinessEmptyState title="Chưa có dữ liệu" detail="Dữ liệu sẽ xuất hiện sau khi đồng bộ."/></BusinessCard>
    <BusinessCard title="Form dự án — cùng định nghĩa cho thêm và sửa"><FormExample schema={PROJECT_FORM}/></BusinessCard>
    <BusinessCard title="Form dầu — thành tiền trước khi lưu"><FormExample schema={FUEL_FORM}/></BusinessCard>
    <BusinessCard title="Phạm vi rà soát R7">
      {BUSINESS_FORM_INVENTORY.map(group => <BusinessListRow key={group.family} title={`${group.family}: ${group.forms.length} nhóm`} detail={group.forms.join(' · ')}/>)}
      <p className={styles.note}>Các form Danh mục, Vận hành và Quỹ đã dùng component R7. Danh sách này thể hiện phạm vi kiểm tra; kết quả và giới hạn kiểm chứng được ghi trong PROJECT_CONTEXT.md.</p>
    </BusinessCard>
  </div>;
}
