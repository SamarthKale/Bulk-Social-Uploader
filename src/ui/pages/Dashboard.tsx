import { api } from '../api';
import { Card, ErrorBanner, PageHeader, usePoll, fmtDate } from '../components/ui';

interface Data {
  counts: Record<string, number>;
  channel: { channel_id: string; channel_title: string } | null;
  paused: boolean;
  recent: { id: number; event_type: string; message: string; created_at: string }[];
}

const TILES: [string, string][] = [
  ['detected', 'Videos detected'],
  ['metadataReady', 'Metadata ready'],
  ['awaitingApproval', 'Awaiting approval'],
  ['queued', 'Queued for upload'],
  ['uploading', 'Uploading now'],
  ['uploadComplete', 'Uploaded, processing on YouTube'],
  ['published', 'Published'],
  ['failed', 'Failed / needs attention'],
  ['skipped', 'Skipped'],
];

export function Dashboard() {
  const { data, error } = usePoll(() => api.get<Data>('/api/dashboard'), 3000);
  const empty = data && data.counts.detected === 0;
  return (
    <div>
      <PageHeader title="Dashboard" />
      <ErrorBanner error={error} />
      {data?.paused && <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">The upload queue is paused. Open Processing Queue to resume.</div>}
      <Card className="mb-4">
        <div className="text-sm text-zinc-500">Connected YouTube channel</div>
        {data?.channel ? (
          <div className="text-lg font-medium">{data.channel.channel_title}</div>
        ) : (
          <div>No channel confirmed yet. <a className="text-indigo-600 underline" href="#/accounts">Connect one in Accounts &amp; Channels.</a></div>
        )}
      </Card>
      {empty && <p className="mb-4 text-zinc-500">No data yet. Add a folder in Folders, then scan it.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {TILES.map(([key, label]) => (
          <Card key={key}>
            <div className="text-2xl font-semibold" data-testid={`count-${key}`}>{data ? data.counts[key] : '-'}</div>
            <div className="text-sm text-zinc-500">{label}</div>
          </Card>
        ))}
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Recent activity</h2>
      <Card>
        {data && data.recent.length === 0 ? (
          <p className="text-sm text-zinc-500">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {data?.recent.map((r) => (
              <li key={r.id} className="flex justify-between gap-4 py-1.5">
                <span>{r.message}</span>
                <span className="shrink-0 text-zinc-500">{fmtDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
