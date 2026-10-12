'use client';

const DISCARD_MESSAGE = 'Biểu mẫu có dữ liệu chưa lưu. Nếu đóng, các thay đổi này sẽ bị mất. Bạn vẫn muốn đóng?';

export function confirmDiscardUnsavedChanges(dirty: boolean): boolean {
  return !dirty || window.confirm(DISCARD_MESSAGE);
}
