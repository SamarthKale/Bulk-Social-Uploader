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
import { registerAccountRoutes, CLIENT_SECRET_NAME } from './routes/accounts.js';
import { registerQueueRoutes } from './routes/queue.js';
import { createAccountAuth, type AccountAuth } from './youtube/accounts.js';
import { GOOGLE_ENDPOINTS, type GoogleEndpoints } from './youtube/oauth.js';

export interface AppDeps {
  db: Db;
  token: string;
  pickFolder: () => Promise<string | null>;
  secrets: SecretStore;
  getProvider: () => Promise<AiProvider | null>;
  /** App-owned scratch directory for extracted frames. */
  tempDir: () => string;
  oauthEndpoints: GoogleEndpoints;
  auth: AccountAuth;
}

export type AppInit = Pick<AppDeps, 'db' | 'token'> & Partial<Omit<AppDeps, 'db' | 'token'>>;

export function buildApp(init: AppInit): FastifyInstance {
  const secrets = init.secrets ?? createSecretStore(path.join(dataDirPath(), 'secrets.json'));
  const oauthEndpoints = init.oauthEndpoints ?? GOOGLE_ENDPOINTS;
  const deps: AppDeps = {
    pickFolder: nativePickFolder,
    getProvider: makeProviderGetter(init.db, secrets),
    tempDir: () => getSettings(init.db).tempDir || path.join(os.tmpdir(), 'localtube-work'),
    auth: createAccountAuth({
      db: init.db,
      secrets,
      endpoints: oauthEndpoints,
      getClient: async () => ({ clientId: getSettings(init.db).googleClientId, clientSecret: (await secrets.get(CLIENT_SECRET_NAME)) ?? undefined }),
    }),
    ...init,
    secrets,
    oauthEndpoints,
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
  registerAccountRoutes(app);
  registerQueueRoutes(app);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
