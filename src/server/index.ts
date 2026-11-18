import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildApp } from './app.js';
import { openDb } from './db/db.js';
import { dataDir, PORT } from './config.js';
import { log, setLogDir } from './log.js';

async function main() {
  const dir = dataDir();
  setLogDir(path.join(dir, 'logs'));
  const db = openDb(path.join(dir, 'localtube.db'));
  const token = crypto.randomBytes(24).toString('hex');
  const app = buildApp({ db, token });
  await app.listen({ host: '127.0.0.1', port: PORT });
  const url = `http://127.0.0.1:${PORT}/#token=${token}`;
  log.info('server started', { port: PORT });
  console.log(`LocalTube running: ${url}`);
  if (process.platform === 'win32' && !process.env.LOCALTUBE_NO_OPEN) {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
