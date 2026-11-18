import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { errorText } from '../api';

export function Button({ variant = 'default', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  const styles = {
    default: 'border border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800',
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
    danger: 'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950',
    ghost: 'hover:bg-zinc-200 dark:hover:bg-zinc-800',
  }[variant];
  return <button {...p} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>{children}</div>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const TONE: Record<string, string> = {
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  idle: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};
const STATUS_TONE: Record<string, string> = {
  VALID: 'good', READY: 'good', APPROVED: 'good', UPLOAD_COMPLETE: 'good', NOT_REQUIRED: 'idle',
  UPLOADING: 'info', ANALYZING: 'info', GENERATING: 'info', PROCESSING: 'info', QUEUED: 'info', WAITING_FOR_STABLE_FILE: 'info',
  PENDING: 'warn', RETRY_WAIT: 'warn', STALE: 'warn', UPLOAD_PAUSED: 'warn', BLOCKED_BY_QUOTA: 'warn', BLOCKED_BY_CHANNEL_LIMIT: 'warn', UPLOAD_OUTCOME_UNKNOWN: 'bad', DUPLICATE: 'warn', STATUS_UNKNOWN: 'warn',
  FAILED: 'bad', FAILED_PERMANENTLY: 'bad', INVALID: 'bad', REJECTED: 'bad', UNAVAILABLE: 'bad', CANCELLED: 'idle', SKIPPED: 'idle', NOT_STARTED: 'idle', NOT_QUEUED: 'idle', NOT_CHECKED: 'idle',
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[STATUS_TONE[status] ?? 'idle']}`}>{label ?? status.replaceAll('_', ' ').toLowerCase()}</span>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export const inputCls = 'w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  return error ? <div role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null;
}

/** Polls an async loader; keeps the last good data on failure. */
export function usePoll<T>(load: () => Promise<T>, ms = 3000): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(load);
  ref.current = load;
  const reload = useCallback(() => {
    ref.current().then((d) => { setData(d); setError(null); }, (e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
  }, [reload, ms]);
  return { data, error, reload };
}

export const fmtDuration = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
export const fmtSize = (b: number | null) => (b == null ? '' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);
export const fmtDate = (s: string | null) => (s ? new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z').toLocaleString() : '');
