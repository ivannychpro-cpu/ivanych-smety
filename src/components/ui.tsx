import React, { useEffect, useRef, useState } from 'react';
import { parseNum } from '../lib/money';

export function Card({ title, actions, children, bodyClass, className }: {
  title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
  bodyClass?: string; className?: string;
}) {
  return (
    <div className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="card-head">
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          <div className="spacer" />
          {actions}
        </div>
      )}
      <div className={`card-body ${bodyClass ?? ''}`}>{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, ...rest }: {
  value: string; onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function NumInput({ value, onChange, className, ...rest }: {
  value: number; onChange: (v: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(String(value ?? 0));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value ?? 0)); }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={`num ${className ?? ''}`}
      value={text}
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onBlur={() => { focused.current = false; setText(String(value ?? 0)); }}
      onChange={(e) => { setText(e.target.value); onChange(parseNum(e.target.value)); }}
      {...rest}
    />
  );
}

export function Select<T extends string>({ value, onChange, options, className, ...rest }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value as T)} {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Modal({ title, children, onClose, footer, size }: {
  title: React.ReactNode; children: React.ReactNode; onClose: () => void;
  footer?: React.ReactNode; size?: 'lg' | 'xl';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size ?? ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon = '📄', title, hint, action }: {
  icon?: string; title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div className="strong">{title}</div>
      {hint && <div className="small mt-8">{hint}</div>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

export function Avatar({ name, lg }: { name: string; lg?: boolean }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <div className={`avatar ${lg ? 'lg' : ''}`}>{initials}</div>;
}

export function Badge({ kind, children }: { kind?: 'blue' | 'green' | 'amber' | 'red' | 'purple'; children: React.ReactNode }) {
  return <span className={`badge ${kind ?? ''}`}>{children}</span>;
}

export function Kpi({ label, value, hint, delta, tone }: {
  label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode;
  delta?: { value: string; up: boolean }; tone?: 'green' | 'red' | 'amber';
}) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : undefined;
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value" style={{ color }}>{value}</div>
      {(hint || delta) && (
        <div className="hint">
          {delta && <span className={`delta ${delta.up ? 'up' : 'down'}`}>{delta.up ? '▲' : '▼'} {delta.value} </span>}
          {hint}
        </div>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: {
  value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.value} className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}{t.count != null && <span className="muted-2"> · {t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'Удалить', onConfirm, onClose }: {
  title: string; message: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </>}
    >
      <p className="mb-0">{message}</p>
    </Modal>
  );
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
