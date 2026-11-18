import type { Db } from '../db/db.js';
import { listFolders } from '../folders/folderRepo.js';
import { log } from '../log.js';
import { scanFolder, type ScanOptions } from './scanner.js';

export interface ScanLoopOptions {
  /** Milliseconds between automatic scans; 0 turns automatic scanning off (manual "Scan now" still works). */
  intervalMs: () => number;
  stableMs?: () => number;
  probe?: ScanOptions['probe'];
}

/**
 * Low-priority incremental rescans of every enabled folder, one at a time. Scanning only discovers
 * files: publishing is decided later by each folder's own auto-publish setting.
 */
export function startScanLoop(db: Db, opts: ScanLoopOptions): { runNow(): Promise<void>; stop(): void } {
  let current: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  async function scanAll(): Promise<void> {
    for (const f of listFolders(db)) {
      if (stopped) return;
      try {
        await scanFolder(db, f.id, { stableMs: opts.stableMs?.(), probe: opts.probe });
      } catch (e) {
        log.error('folder scan failed', { folder: f.path, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  const runNow = (): Promise<void> => (current ??= scanAll().finally(() => (current = null)));

  function schedule(): void {
    if (stopped) return;
    const ms = opts.intervalMs();
    if (ms <= 0) return;
    timer = setTimeout(() => void runNow().finally(schedule), ms);
  }

  if (opts.intervalMs() > 0) void runNow().finally(schedule);

  return {
    runNow,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
