'use client';

import { useId } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import type { BusinessField } from '../../lib/platform/business-form-schema';
import styles from './business-primitives.module.css';

export function BusinessButton({ variant = 'primary', busy = false, children, className = '', disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'secondary' | 'ghost'; busy?: boolean }) {
  return <button data-business-control {...props} type={props.type || 'button'} disabled={disabled || busy} aria-busy={busy || undefined} className={`${styles.button} ${styles[variant]} ${className}`}>
    {children}
  </button>;
}
export function BusinessBadge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
export function BusinessCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className={styles.card}><header className={styles.cardHeader}><h2>{title}</h2>{action}</header><div>{children}</div></section>;
}
export function BusinessGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
export function BusinessFieldControl({ field, value, onChange, options = [], error = '', disabled = false, state, inputList, placeholder, readOnly = false, hint, allowEmpty = true, optionLabels = {} }: {
  field: BusinessField; value: string; onChange: (value: string) => void; options?: readonly string[]; error?: string; disabled?: boolean; state?: 'focus' | 'hover'; inputList?: string; placeholder?: string; readOnly?: boolean; hint?: string; allowEmpty?: boolean; optionLabels?: Record<string,string>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const shared = { 'data-business-control': true, id, disabled, required: field.required, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? hintId : undefined, className: styles.control, value, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(event.target.value) };
  return <div className={styles.field} data-field-key={field.key} data-span={field.span} data-demo-state={state}>
    <label htmlFor={id}>{field.label}{field.required ? <span aria-hidden="true"> *</span> : null}</label>
    {field.kind === 'date' ? <div className={styles.dateBox}><span aria-hidden="true">{value ? value.split('-').reverse().join('/') : 'Chọn ngày'}</span><input {...shared} type="date" className={`${styles.control} ${styles.dateNative}`}/></div> : field.kind === 'textarea' ? <textarea {...shared} rows={2}/> : field.kind === 'select' ? <select {...shared}>{allowEmpty ? <option value="">Chọn</option> : null}{Array.from(new Set([...(value && !options.includes(value) ? [value] : []), ...options])).map(option => <option value={option} key={option}>{optionLabels[option] || option}</option>)}</select> : <input {...shared} list={inputList} placeholder={placeholder} readOnly={readOnly} autoComplete={inputList ? "off" : undefined} autoCapitalize={field.key === "tickets" ? "none" : undefined} type="text" inputMode={field.kind === 'number' ? 'decimal' : undefined}/>}
    {hint && !error ? <small id={hintId} className={styles.fieldHint}>{hint}</small> : null}
    {error ? <span id={hintId} className={styles.fieldError}>{error}</span> : null}
  </div>;
}
export function BusinessInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input data-business-control {...props} className={`${styles.control} ${props.className || ''}`}/>;
}
export function BusinessListRow({ title, detail, trailing }: { title: string; detail?: string; trailing?: ReactNode }) {
  return <div className={styles.listRow}><div><strong>{title}</strong>{detail ? <p>{detail}</p> : null}</div>{trailing}</div>;
}
/** Shared modal content; the caller owns portal, dialog semantics, focus trap and dismissal. */
export function BusinessModalContent({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return <div className={styles.modalContent}><header><h3>{title}</h3></header><div className={styles.modalBody}>{children}</div>{footer ? <footer>{footer}</footer> : null}</div>;
}
export function BusinessEmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className={styles.empty}><strong>{title}</strong>{detail ? <p>{detail}</p> : null}{action}</div>;
}
export function BusinessAmountSummary({ label = 'Thành tiền', value, hint }: { label?: string; value: string; hint?: string }) {
  return <div className={styles.amount} role="status" aria-live="polite" aria-atomic="true"><span>{label}</span><output>{value}</output>{hint ? <small>{hint}</small> : null}</div>;
}
