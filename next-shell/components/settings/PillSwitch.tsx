'use client';

type PillSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

export function PillSwitch({ checked, disabled = false, label, onChange }: PillSwitchProps) {
  return <button
    type="button"
    className="pill-switch"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  >
    <span className="pill-switch-track" aria-hidden="true">
      <span className="pill-switch-thumb" />
    </span>
  </button>;
}
