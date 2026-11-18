import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getSettings, setSettings } from '../settings.js';

export const GEMINI_SECRET = 'geminiApiKey';

export function registerSettingsRoutes(app: FastifyInstance): void {
  const { db, secrets } = app.deps;

  const view = async () => ({ ...getSettings(db), geminiKeySet: (await secrets.get(GEMINI_SECRET)) !== null });

  app.get('/api/settings', async () => view());

  app.put('/api/settings', async (req, reply) => {
    try {
      setSettings(db, req.body);
    } catch {
      return reply.code(400).send({ error: 'invalid settings' });
    }
    return view();
  });

  // Write-only: the key is never returned by any route.
  app.put('/api/settings/gemini-key', async (req, reply) => {
    const body = z.object({ key: z.string().min(8).max(500) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid key' });
    await secrets.set(GEMINI_SECRET, body.data.key.trim());
    return { ok: true, geminiKeySet: true };
  });

  app.delete('/api/settings/gemini-key', async () => {
    await secrets.delete(GEMINI_SECRET);
    return { ok: true, geminiKeySet: false };
  });
}
