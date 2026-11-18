import { useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { Button, Card, ErrorBanner, Field, PageHeader, Toggle, inputCls, usePoll } from '../components/ui';
import type { Settings } from '../types';

export function SettingsPage() {
  const s = usePoll(() => api.get<Settings>('/api/settings'), 60000);
  const [form, setForm] = useState<Settings | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => { if (s.data && !form) setForm(s.data); }, [s.data, form]);
  if (!form) return <div><PageHeader title="Settings" /><ErrorBanner error={s.error} /></div>;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError(null); setNote('');
    try { await fn(); setNote(ok); s.reload(); } catch (e) { setError(errorText(e)); }
  };
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) });
  const saveSettings = () => run(async () => {
    const { geminiKeySet: _k, googleClientId: _g, queuePaused: _q, ...rest } = form;
    const next = await api.put<Settings>('/api/settings', rest);
    setForm(next);
  }, 'Settings saved');

  return (
    <div>
      <PageHeader title="Settings" />
      <ErrorBanner error={error ?? s.error} />
      {note && <div className="mb-3 text-sm text-emerald-600" role="status">{note}</div>}

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">AI (Gemini)</h2>
        <p className="text-sm text-zinc-500">A Gemini API key from Google AI Studio is separate from any Google or Gemini subscription. The key is stored encrypted on this PC and is never shown again or sent to the browser.</p>
        <Field label={form.geminiKeySet ? 'Gemini API key (saved; enter a new one to replace)' : 'Gemini API key'}>
          <input className={inputCls} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Gemini API key" />
        </Field>
        <div className="flex gap-2">
          <Button disabled={key.trim().length < 8} onClick={() => run(async () => { await api.put('/api/settings/gemini-key', { key: key.trim() }); setKey(''); }, 'API key saved')}>Save key</Button>
          {form.geminiKeySet && <Button variant="danger" onClick={() => run(() => api.del('/api/settings/gemini-key'), 'API key removed')}>Remove key</Button>}
        </div>
        <Field label="Model" hint="Which Gemini model writes titles and descriptions."><input className={inputCls} value={form.geminiModel} onChange={(e) => setForm({ ...form, geminiModel: e.target.value })} /></Field>
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <Toggle checked={form.aiConsent} onChange={(v) => setForm({ ...form, aiConsent: v })} label="Allow sending video frames to Google Gemini" />
          <p className="mt-1 text-amber-900 dark:text-amber-200">When on, a few small still frames sampled from each video (and the file name) leave this computer and are sent to Google to write the title and description. Your video files are never uploaded to the AI provider. When off, no AI generation happens and you can write metadata by hand.</p>
        </div>
      </Card>

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Processing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="AI workers (1-4)" hint="How many videos are analysed at once."><input className={inputCls} type="number" min={1} max={4} value={form.aiWorkers} onChange={num('aiWorkers')} /></Field>
          <Field label="Upload workers (1-2)" hint="Default 1. More can trigger YouTube limits sooner."><input className={inputCls} type="number" min={1} max={2} value={form.uploadWorkers} onChange={num('uploadWorkers')} /></Field>
          <Field label="Wait before a new file is processed (ms)" hint="A file must stop changing for this long, so files still being copied are skipped."><input className={inputCls} type="number" min={100} value={form.stableMs} onChange={num('stableMs')} /></Field>
          <Field label="Rescan folders every (minutes, 0 = off)"><input className={inputCls} type="number" min={0} max={1440} value={form.scanIntervalMin} onChange={num('scanIntervalMin')} /></Field>
        </div>
        <Field label="Temporary folder for extracted frames (blank = system default)" hint="Only LocalTube's own scratch files go here. Your videos are never copied, moved or deleted."><input className={inputCls} value={form.tempDir} onChange={(e) => setForm({ ...form, tempDir: e.target.value })} /></Field>
        <Button variant="primary" onClick={saveSettings}>Save settings</Button>
      </Card>
    </div>
  );
}
