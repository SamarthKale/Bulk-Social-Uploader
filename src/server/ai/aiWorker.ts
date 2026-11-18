import type { Db } from '../db/db.js';
import { log } from '../log.js';
import { getSettings } from '../settings.js';
import { generateMetadata } from './generate.js';
import type { AiProvider } from './provider.js';

export interface AiWorkerDeps {
  db: Db;
  getProvider: () => Promise<AiProvider | null>;
  tempDir: () => string;
  pollMs?: number;
  retryDelayMs?: number;
  frameCount?: number;
}

/** After a crash, videos mid-analysis are put back in the queue. */
export function resetStuckAi(db: Db): void {
  db.prepare("UPDATE videos SET metadata_status='NOT_STARTED' WHERE metadata_status IN ('ANALYZING','GENERATING')").run();
}

/**
 * Polls for VALID videos whose metadata is NOT_STARTED or STALE and generates it, at most
 * `concurrency` at a time. Idle while AI consent is off or no provider is configured.
 */
export function startAiWorker(deps: AiWorkerDeps, concurrency: number | (() => number)): { stop(): Promise<void> } {
  const { db } = deps;
  const inFlight = new Set<Promise<unknown>>();
  let stopped = false;
  resetStuckAi(db);

  const claim = db.prepare("UPDATE videos SET metadata_status='ANALYZING' WHERE id = ? AND metadata_status IN ('NOT_STARTED','STALE')");
  const candidates = db.prepare("SELECT id FROM videos WHERE discovery_status='VALID' AND metadata_status IN ('NOT_STARTED','STALE') ORDER BY id LIMIT ?");

  async function tick(): Promise<void> {
    if (stopped) return;
    const max = typeof concurrency === 'function' ? concurrency() : concurrency;
    const free = max - inFlight.size;
    if (free <= 0 || !getSettings(db).aiConsent) return;
    const provider = await deps.getProvider();
    if (!provider || stopped) return;
    for (const { id } of candidates.all(free) as { id: number }[]) {
      if (claim.run(id).changes === 0) continue;
      const job = generateMetadata(
        { db, provider, tempDir: deps.tempDir(), retryDelayMs: deps.retryDelayMs, frameCount: deps.frameCount },
        id,
      )
        .catch((e) => log.error('ai worker job crashed', { id, error: String(e) }))
        .finally(() => inFlight.delete(job));
      inFlight.add(job);
    }
  }

  const timer = setInterval(() => void tick().catch((e) => log.error('ai worker tick failed', { error: String(e) })), deps.pollMs ?? 2000);
  void tick().catch(() => undefined);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await Promise.allSettled([...inFlight]);
    },
  };
}
