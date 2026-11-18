import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
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
import { registerHistoryRoutes } from './routes/history.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerVideoRoutes } from './routes/videos.js';
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
    // A web page on another origin can make the browser send requests to 127.0.0.1 (DNS rebinding).
    // Only localhost host names are served; the per-launch token is the second lock on /api.
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(req.headers.host ?? '')) {
      return reply.code(403).send({ error: 'forbidden host' });
    }
    // Match on the DECODED path: the router decodes percent-escapes, so "/%61pi/..." reaches /api routes.
    let pathname = req.url.split('?')[0];
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      return reply.code(400).send({ error: 'bad request path' });
    }
    if (/^\/+api(\/|$)/i.test(pathname) && req.headers['x-localtube-token'] !== deps.token) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('content-security-policy', "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
  });
  app.get('/api/health', async () => ({ ok: true }));
  registerFolderRoutes(app);
  registerSettingsRoutes(app);
  registerProfileRoutes(app);
  registerMetadataRoutes(app);
  registerAccountRoutes(app);
  registerQueueRoutes(app);
  registerHistoryRoutes(app);
  registerDashboardRoutes(app);
  registerVideoRoutes(app);

  // The built React UI (npm run build:ui). Absent in tests and during API-only development.
  const uiDir = path.resolve(process.cwd(), 'dist', 'ui');
  if (fs.existsSync(path.join(uiDir, 'index.html'))) {
    void app.register(fastifyStatic, { root: uiDir });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ error: 'not found' }) : reply.sendFile('index.html'),
    );
  }
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
