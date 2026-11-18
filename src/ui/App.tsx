import { useEffect, useState, type ComponentType } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Folders } from './pages/Folders';
import { Profiles } from './pages/Profiles';
import { Library } from './pages/Library';
import { Queue } from './pages/Queue';
import { History } from './pages/History';
import { Accounts } from './pages/Accounts';
import { SettingsPage } from './pages/Settings';
import { api } from './api';

const PAGES: { id: string; label: string; Page: ComponentType }[] = [
  { id: 'dashboard', label: 'Dashboard', Page: Dashboard },
  { id: 'folders', label: 'Folders', Page: Folders },
  { id: 'profiles', label: 'AI Profiles', Page: Profiles },
  { id: 'library', label: 'Video Library', Page: Library },
  { id: 'queue', label: 'Processing Queue', Page: Queue },
  { id: 'history', label: 'Upload History', Page: History },
  { id: 'accounts', label: 'Accounts & Channels', Page: Accounts },
  { id: 'settings', label: 'Settings', Page: SettingsPage },
];

const routeFromHash = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return PAGES.some((p) => p.id === r) ? r : 'dashboard';
};

export function App() {
  // Reading the API once strips the launch token from the address bar.
  const [route, setRoute] = useState(() => {
    void api.get('/api/health').catch(() => undefined);
    return routeFromHash();
  });
  useEffect(() => {
    const on = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const Current = PAGES.find((p) => p.id === route)!.Page;
  return (
    <div className="flex min-h-screen">
      <nav aria-label="Main" className="w-56 shrink-0 border-r border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-6 text-lg font-bold">LocalTube</div>
        <ul className="space-y-1">
          {PAGES.map((p) => (
            <li key={p.id}>
              <a
                href={`#/${p.id}`}
                aria-current={route === p.id ? 'page' : undefined}
                className={`block rounded-md px-3 py-2 text-sm ${route === p.id ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
              >
                {p.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="min-w-0 flex-1 p-6">
        <Current />
      </main>
    </div>
  );
}
