'use client';

import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'vtdb-theme-preference';
const OPTIONS: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'light', label: 'Sáng', description: 'Luôn dùng nền sáng.' },
  { value: 'dark', label: 'Tối', description: 'Luôn dùng nền tối dịu mắt.' },
  { value: 'system', label: 'Theo thiết bị', description: 'Tự đổi theo cài đặt iPhone hoặc máy tính.' }
];

function validPreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function applyTheme(preference: ThemePreference) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = resolved === 'dark' ? '#07111f' : '#f8fafc';
  });
}

export function ThemePreferenceControl() {
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = validPreference(stored) ? stored : 'system';
    applyTheme(initial);
    const syncSelection = window.setTimeout(() => setPreference(initial), 0);

    return () => {
      window.clearTimeout(syncSelection);
    };
  }, []);

  const choose = (value: ThemePreference) => {
    setPreference(value);
    window.localStorage.setItem(STORAGE_KEY, value);
    applyTheme(value);
  };

  return <article className="info-card appearance-settings-card" aria-labelledby="appearanceThemeTitle">
    <div>
      <h2 id="appearanceThemeTitle">Chế độ hiển thị</h2>
      <p>Chọn giao diện phù hợp; thiết lập được lưu riêng trên thiết bị này.</p>
    </div>
    <div className="theme-preference-options" role="radiogroup" aria-labelledby="appearanceThemeTitle">
      {OPTIONS.map((option) => <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={preference === option.value}
        className={`theme-preference-option${preference === option.value ? ' selected' : ''}`}
        onClick={() => choose(option.value)}
      >
        <span className={`theme-preview theme-preview-${option.value}`} aria-hidden="true"><i/><i/><i/></span>
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
        <span className="theme-preference-check" aria-hidden="true">✓</span>
      </button>)}
    </div>
  </article>;
}

export function ThemeRuntimeSync() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const current = window.localStorage.getItem(STORAGE_KEY);
      applyTheme(validPreference(current) ? current : 'system');
    };
    update();
    media.addEventListener('change', update);
    window.addEventListener('storage', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return null;
}
