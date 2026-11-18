import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db/db.js';
import { pickFolder as nativePickFolder } from './folders/nativeDialog.js';
import { registerFolderRoutes } from './routes/folders.js';

export interface AppDeps {
  db: Db;
  token: string;
  pickFolder: () => Promise<string | null>;
}

export type AppInit = Omit<AppDeps, 'pickFolder'> & Partial<Pick<AppDeps, 'pickFolder'>>;

export function buildApp(init: AppInit): FastifyInstance {
  const deps: AppDeps = { pickFolder: nativePickFolder, ...init };
  const app = Fastify({ logger: false });
  app.decorate('deps', deps);
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && req.headers['x-localtube-token'] !== deps.token) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  app.get('/api/health', async () => ({ ok: true }));
  registerFolderRoutes(app);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
