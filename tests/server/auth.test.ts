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

  it('rejects requests whose Host header is not localhost (DNS rebinding defence), even with the token', async () => {
    const app = buildApp({ db: openDb(':memory:'), token: 't0k' });
    const bad = await app.inject({ method: 'GET', url: '/api/health', headers: { 'x-localtube-token': 't0k', host: 'evil.example.com' } });
    expect(bad.statusCode).toBe(403);
    for (const host of ['127.0.0.1:4317', 'localhost:4317', 'localhost']) {
      const ok = await app.inject({ method: 'GET', url: '/api/health', headers: { 'x-localtube-token': 't0k', host } });
      expect(ok.statusCode, host).toBe(200);
    }
  });

  it('sends a restrictive Content-Security-Policy and nosniff on every response', async () => {
    const app = buildApp({ db: openDb(':memory:'), token: 't0k' });
    const r = await app.inject({ method: 'GET', url: '/api/health', headers: { 'x-localtube-token': 't0k' } });
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('redacts secrets from log context', () => {
    const out = JSON.stringify(redact({ access_token: 'abc', nested: { Authorization: 'Bearer zzz' }, keep: 'fine' }));
    expect(out).not.toContain('abc');
    expect(out).not.toContain('zzz');
    expect(out).toContain('fine');
  });
});
