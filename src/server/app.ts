import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db/db.js';
import { dataDirPath } from './config.js';
import { pickFolder as nativePickFolder } from './folders/nativeDialog.js';
import { createSecretStore, type SecretStore } from './secrets/secretStore.js';
import { registerFolderRoutes } from './routes/folders.js';
import { registerSettingsRoutes } from './routes/settings.js';

export interface AppDeps {
  db: Db;
  token: string;
  pickFolder: () => Promise<string | null>;
  secrets: SecretStore;
}

export type AppInit = Pick<AppDeps, 'db' | 'token'> & Partial<Pick<AppDeps, 'pickFolder' | 'secrets'>>;

export function buildApp(init: AppInit): FastifyInstance {
  const deps: AppDeps = {
    pickFolder: nativePickFolder,
    secrets: createSecretStore(path.join(dataDirPath(), 'secrets.json')),
    ...init,
  };
  const app = Fastify({ logger: false });
  app.decorate('deps', deps);
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && req.headers['x-localtube-token'] !== deps.token) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  app.get('/api/health', async () => ({ ok: true }));
  registerFolderRoutes(app);
  registerSettingsRoutes(app);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
