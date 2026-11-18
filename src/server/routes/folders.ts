import fs from 'node:fs';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { addFolder, listFolders, removeFolder, updateFolder } from '../folders/folderRepo.js';

const AddBody = z.object({ path: z.string().min(1), recursive: z.boolean().optional() });
const PatchBody = z
  .object({
    display_name: z.string().min(1).max(200),
    recursive_scan: z.number().int().min(0).max(1),
    monitor_enabled: z.number().int().min(0).max(1),
    ai_profile_id: z.number().int().nullable(),
    auto_publish: z.number().int().min(0).max(1),
    default_visibility: z.enum(['public', 'unlisted', 'private']),
    default_category_id: z.string().min(1).max(10),
    default_playlist_id: z.string().nullable(),
  })
  .partial()
  .strict();

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function registerFolderRoutes(app: FastifyInstance): void {
  const { db } = app.deps;

  app.get('/api/folders', async () => listFolders(db).map((f) => ({ ...f, available: isDirectory(f.path) })));

  app.post('/api/folders', async (req, reply) => {
    const body = AddBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid body' });
    if (!isDirectory(body.data.path)) return reply.code(400).send({ error: 'folder does not exist or is not a directory' });
    return addFolder(db, body.data);
  });

  app.post('/api/folders/pick', async (_req, reply) => {
    const picked = await app.deps.pickFolder();
    if (!picked) return reply.code(204).send();
    if (!isDirectory(picked)) return reply.code(400).send({ error: 'folder does not exist' });
    return addFolder(db, { path: picked });
  });

  app.patch('/api/folders/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = PatchBody.safeParse(req.body);
    if (!body.success || !Number.isInteger(id)) return reply.code(400).send({ error: 'invalid body' });
    return updateFolder(db, id, body.data);
  });

  app.delete('/api/folders/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' });
    removeFolder(db, id);
    return { ok: true };
  });
}
