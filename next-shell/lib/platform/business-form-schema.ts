/** Presentation schemas. Physical Sheet headers and write payload order stay authoritative. */
export type BusinessField = {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'date' | 'select' | 'textarea';
  span: 'half' | 'full';
  required?: boolean;
};
export type BusinessForm = { id: string; title: string; fields: readonly BusinessField[] };
const field = (key: string, label: string, kind: BusinessField['kind'], span: BusinessField['span'] = 'half', required = false): BusinessField => ({ key, label, kind, span, required });

/** The same field schema is rendered for create/edit and for every viewport. */
export const PROJECT_FORM: BusinessForm = {
  id: 'DM_DuAn', title: 'Dự án', fields: [
    field('project', 'Dự án', 'text', 'half', true),
    field('distance', 'Số km', 'number'),
    field('fromDate', 'Từ ngày', 'date'),
    field('toDate', 'Đến ngày', 'date'),
    field('operationGroup', 'Nhóm vận hành', 'select', 'half'),
    field('tripSalary', 'Lương chuyến?', 'select'),
    field('managerBonus', 'Thưởng QL?', 'select'),
    field('note', 'Ghi chú', 'textarea', 'full'),
  ],
};
export const FUEL_FORM: BusinessForm = {
  id: 'NL_Dau', title: 'Dầu lẻ', fields: [
    field('date', 'Ngày tiếp dầu', 'date', 'half', true),
    field('vehicle', 'Biển số xe', 'select', 'half', true),
    field('source', 'Nguồn cung cấp', 'select', 'full', true),
    field('liters', 'Số lít dầu', 'number', 'half', true),
    field('price', 'Đơn giá / lít', 'number', 'half', true),
    field('sourcePay', 'Nguồn chi', 'select'),
    field('note', 'Ghi chú', 'textarea', 'full'),
  ],
};

/** Inventory is coverage scope, not a claim that every family has passed visual QA. */
export const BUSINESS_FORM_INVENTORY = [
  { family: 'Danh mục — thêm/sửa', forms: ['DM_NhanSu','DM_Xe','DM_DuAn','DM_CheDoLuong','DM_BaoHiem','DM_LuongChuyen','DM_ThamSo_TS','DM_GiaDau','DM_DonGiaVanChuyen','DM_UuDaiNoiBo','DM_ThuongQuanLy','DM_PhatNoiBo','DM_PhanCongXe'] },
  { family: 'Vận hành — chỉnh sửa', forms: ['NL_VanChuyen','NL_TaiXe','NL_Dau','NL_ChamCong','NL_Phat','NL_NghiVanHanh','NL_PhanCongLai','NL_SoDuLuong'] },
  { family: 'Vận hành — nhập mới', forms: ['vanChuyen','taiXe','dau','chamCong','phat','nghiVanHanh'] },
  { family: 'Quỹ — drawer', forms: ['transactions','debtPayment','loan','payment'] },
  { family: 'Quỹ — form trong trang', forms: ['openingSettings','categories'] },
] as const;

/** Header-based presentation binding; never filters or reorders live editable headers. */
export const normalizeBusinessHeader = (label: string) => label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
const NUMBER_HEADERS = new Set(['so gio nghi','so tien phat','so tien/xe','gia dau moc','tu chuyen','den chuyen','dieu chinh','so km','km','cu ly','gia dau ap dung','don gia van chuyen','don gia luong chuyen','nghi chuan','uu dai noi bo','don gia 1 lai','don gia 2 lai','moc chuyen','so chuyen moc','muc phat','muc luong','muc thuong ngay','muc thuong thang','gia dau','don gia','gia','gia tri','so lit','so lit dau','so chuyen','so gio','so gio dung may','so tien','tien','tien phat','luong cung','luong chuyen','muc khoan','muc khau tru/thang','he so','khoi luong','khoi luong thuc te (m³)','so ngay','so du goc','xu ly ky nay','muc thuong','thuong','moc kpi']);
const DATE_HEADERS = new Set(['ngay','tu ngay','den ngay','ngay vao','ngay nghi','tinh thuong','dung thuong','hieu luc tu','hieu luc den','ngay ap dung','ngay ap dung tham so','ngay tiep dau','ngay bao nghi','ngay lap bien ban']);
const SHORT_HEADERS = new Set(['bien so ro mooc','loai xe','trang thai','che do luong','ma loai tinh','cach tinh','don vi','du an','ten du an','bien so','bien so xe','xe','nhan su','tai xe','nguoi tuyen','chuc vu','cong ty','cong ty so huu','nhom van hanh','luong chuyen?','thuong ql?','ap dung luong chuyen?','ap dung thuong ql?','nguon chi','loai','hinh thuc','loai ngay cong','loai ngay nghi','ma phat','ma vi pham','ma vi pham noi bo','loai nghi','ly do dung may','ky phat sinh','thang xu ly','ma khoan','thang']);
const CONTEXT_KINDS: Record<string, Record<string, BusinessField['kind']>> = {
  DM_LuongChuyen: {tu:'number',den:'number'},
  DM_DonGiaVanChuyen: {tu:'date',den:'date'},
};
export function businessHeaderIsNumber(header: string, form = '') {
  const h = normalizeBusinessHeader(header);
  return (CONTEXT_KINDS[form]?.[h] || (NUMBER_HEADERS.has(h) ? 'number' : 'text')) === 'number';
}
export function businessHeaderField(header: string, choices: readonly string[] = [], form = ''): BusinessField {
  const h = normalizeBusinessHeader(header);
  const kind: BusinessField['kind'] = choices.length ? 'select' : CONTEXT_KINDS[form]?.[h] || (DATE_HEADERS.has(h) ? 'date' : NUMBER_HEADERS.has(h) ? 'number' : /ghi chu|noi dung|dien giai|dieu kien/.test(h) ? 'textarea' : 'text');
  return { key: header, label: header, kind, span: kind === 'textarea' ? 'full' : kind === 'date' || kind === 'number' || SHORT_HEADERS.has(h) ? 'half' : 'full' };
}
/** Entry key layouts are explicit and independent of translated labels. */
export const ENTRY_FIELD_SPANS: Record<string, Record<string, 'half' | 'full'>> = {
  vanChuyen: {date:'half',vehicle:'half',project:'half',trips:'half',tickets:'full',note:'full',actualVolume:'half'},
  taiXe: {date:'half',vehicle:'half',operationGroup:'half',driver:'half',trips:'half',note:'full'},
  dau: {date:'half',vehicle:'half',source:'full',liters:'half',price:'half',sourcePay:'half',note:'full'},
  chamCong: {fromDate:'half',toDate:'half',person:'half',workdayType:'half',note:'full'},
  phat: {date:'half',person:'half',penaltyCode:'full',note:'full'},
  nghiVanHanh: {date:'half',vehicle:'half',operationGroup:'half',stopType:'half',hours:'half',note:'full'},
};
