/** @deprecated R7 business forms use business-form-schema.ts explicit key/header metadata.
 * Legacy compatibility helper only; do not import into new or migrated forms. */
export function businessFieldMobileSpan(label: string, kind?: string): 'half' | 'full' {
  const name = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  if (kind === 'textarea' || /ghi chu|noi dung|so phieu|dien giai|dieu kien/.test(name)) return 'full';
  if (kind === 'date' || kind === 'number' || /ngay|^tu ngay|^den ngay|hieu luc|tinh thuong|dung thuong/.test(name)) return 'half';
  if (/nhan su|tai xe|nguoi tuyen|nguoi thu|doi tac|noi vay|du an|cong ty|nhom van hanh|ly do|vi pham|nguon cung/.test(name)) return 'full';
  if (kind === 'vehicles' || kind === 'stopVehicles' || /bien so|so km|cu ly|so tien|muc khoan|muc khau tru|khoi luong|luong|thuong|gia\b|so lit|so chuyen|so gio|ky han|lai suat|chu ky|ma vay|chuc vu|^loai|nguon chi/.test(name)) return 'half';
  return 'full';
}
