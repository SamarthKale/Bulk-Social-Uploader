import { useState } from 'react';
import { api, errorText } from '../api';
import { Button, Card, ErrorBanner, PageHeader, StatusBadge, inputCls, usePoll, fmtSize } from '../components/ui';
import type { Job } from '../types';

const RETRYABLE = ['FAILED_PERMANENTLY', 'CANCELLED', 'RETRY_WAIT', 'BLOCKED_BY_QUOTA', 'BLOCKED_BY_CHANNEL_LIMIT', 'UPLOAD_PAUSED'];
const CANCELLABLE = ['QUEUED', 'UPLOADING', 'RETRY_WAIT', 'BLOCKED_BY_QUOTA', 'BLOCKED_BY_CHANNEL_LIMIT', 'UPLOAD_PAUSED', 'UPLOAD_OUTCOME_UNKNOWN'];

export function Queue() {
  const q = usePoll(() => api.get<{ paused: boolean; jobs: Job[] }>('/api/queue'), 2000);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Job | null>(null);
  const [foundId, setFoundId] = useState('');
  const [showDone, setShowDone] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); q.reload(); } catch (e) { setError(errorText(e)); }
  };
  const jobs = (q.data?.jobs ?? []).filter((j) => showDone || j.status !== 'UPLOAD_COMPLETE');

  return (
    <div>
      <PageHeader title="Processing Queue">
        {q.data?.paused ? <Button variant="primary" onClick={() => act(() => api.post('/api/queue/resume'))}>Resume uploads</Button> : <Button onClick={() => act(() => api.post('/api/queue/pause'))}>Pause uploads</Button>}
      </PageHeader>
      <ErrorBanner error={error ?? q.error} />
      {q.data?.paused && <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">Uploads are paused. An upload in progress stops after its current chunk and continues from there when you resume.</div>}
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show finished uploads</label>
      {q.data && jobs.length === 0 && <p className="text-zinc-500">Nothing in the queue. Videos appear here when they are approved or auto-published.</p>}
      <div className="space-y-2">
        {jobs.map((j) => {
          const pct = j.file_size_bytes ? Math.min(100, Math.round((j.bytes_sent / j.file_size_bytes) * 100)) : 0;
          return (
            <Card key={j.id} className="space-y-2" >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{j.title ?? j.filename}</div>
                  <div className="text-xs text-zinc-500">{j.filename} · {j.folder_name} · {fmtSize(j.file_size_bytes)}</div>
                </div>
                <StatusBadge status={j.status} />
              </div>
              {(j.status === 'UPLOADING' || j.bytes_sent > 0) && j.status !== 'UPLOAD_COMPLETE' && (
                <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                  <div className="h-full bg-indigo-600" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="text-sm text-zinc-600 dark:text-zinc-400">{j.reason}</div>
              <div className="flex flex-wrap gap-2">
                {j.youtube_video_id && <a className="text-sm text-indigo-600 underline" href={`https://youtu.be/${j.youtube_video_id}`} target="_blank" rel="noreferrer">Open on YouTube</a>}
                {RETRYABLE.includes(j.status) && <Button onClick={() => act(() => api.post(`/api/jobs/${j.id}/retry`))}>Retry</Button>}
                {j.status === 'UPLOAD_OUTCOME_UNKNOWN' && <Button variant="primary" onClick={() => { setResolving(j); setFoundId(''); }}>Resolve...</Button>}
                {CANCELLABLE.includes(j.status) && <Button variant="danger" onClick={() => { if (confirm('Cancel this upload?')) void act(() => api.post(`/api/jobs/${j.id}/cancel`)); }}>Cancel</Button>}
              </div>
            </Card>
          );
        })}
      </div>
      {resolving && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/40" onClick={() => setResolving(null)}>
          <div role="dialog" aria-label="Resolve unknown upload" className="w-full max-w-lg space-y-3 rounded-lg bg-white p-5 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Did this video reach YouTube?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">LocalTube could not confirm the result of uploading <b>{resolving.filename}</b>. Check your channel in YouTube Studio, then tell LocalTube what you found. It will not upload again until you decide.</p>
            <input className={inputCls} placeholder="YouTube video ID (11 characters), if you found it" value={foundId} onChange={(e) => setFoundId(e.target.value.trim())} aria-label="YouTube video id" />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!/^[A-Za-z0-9_-]{11}$/.test(foundId)} onClick={() => act(async () => { await api.post(`/api/jobs/${resolving.id}/resolve`, { action: 'found', videoId: foundId }); setResolving(null); })}>I found it</Button>
              <Button variant="danger" onClick={() => { if (confirm('Only choose this if the video is definitely NOT on your channel. LocalTube will upload it again and may create a duplicate otherwise.')) void act(async () => { await api.post(`/api/jobs/${resolving.id}/resolve`, { action: 'not_uploaded' }); setResolving(null); }); }}>It is not there, upload again</Button>
              <Button variant="ghost" onClick={() => setResolving(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
