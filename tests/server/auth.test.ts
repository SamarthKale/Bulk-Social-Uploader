import { describe, it, expect } from 'vitest';
import { openDb } from '../../src/server/db/db.js';
import { buildApp } from '../../src/server/app.js';
import { redact } from '../../src/server/log.js';

describe('auth', () => {
  it('401 without token, 200 with token', async () => {
    const app = buildApp({ db: openDb(':memory:'), token: 't0k' });
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(401);
    const ok = await app.inject({ method: 'GET', url: '/api/health', headers: { 'x-localtube-token': 't0k' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true });
  });

  it('redacts secrets from log context', () => {
    const out = JSON.stringify(redact({ access_token: 'abc', nested: { Authorization: 'Bearer zzz' }, keep: 'fine' }));
    expect(out).not.toContain('abc');
    expect(out).not.toContain('zzz');
    expect(out).toContain('fine');
  });
});
