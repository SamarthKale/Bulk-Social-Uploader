import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db/db.js';

export interface AppDeps {
  db: Db;
  token: string;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('deps', deps);
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && req.headers['x-localtube-token'] !== deps.token) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  app.get('/api/health', async () => ({ ok: true }));
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
