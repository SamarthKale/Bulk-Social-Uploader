import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db/db.js';
import { dataDirPath } from './config.js';
import { pickFolder as nativePickFolder } from './folders/nativeDialog.js';
import { createSecretStore, type SecretStore } from './secrets/secretStore.js';
import { getSettings } from './settings.js';
import { makeProviderGetter } from './ai/providerFactory.js';
import type { AiProvider } from './ai/provider.js';
import { registerFolderRoutes } from './routes/folders.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerMetadataRoutes } from './routes/metadata.js';

export interface AppDeps {
  db: Db;
  token: string;
  pickFolder: () => Promise<string | null>;
  secrets: SecretStore;
  getProvider: () => Promise<AiProvider | null>;
  /** App-owned scratch directory for extracted frames. */
  tempDir: () => string;
}

export type AppInit = Pick<AppDeps, 'db' | 'token'> & Partial<Omit<AppDeps, 'db' | 'token'>>;

export function buildApp(init: AppInit): FastifyInstance {
  const secrets = init.secrets ?? createSecretStore(path.join(dataDirPath(), 'secrets.json'));
  const deps: AppDeps = {
    pickFolder: nativePickFolder,
    getProvider: makeProviderGetter(init.db, secrets),
    tempDir: () => getSettings(init.db).tempDir || path.join(os.tmpdir(), 'localtube-work'),
    ...init,
    secrets,
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
  registerProfileRoutes(app);
  registerMetadataRoutes(app);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
