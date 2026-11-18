import Database from 'better-sqlite3';
import fs from 'node:fs';
import { ensureDefaultProfile } from '../ai/profileRepo.js';

export type Db = Database.Database;

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8') },
];

export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const m of MIGRATIONS.filter((x) => x.version > current)) {
    if (file !== ':memory:' && m.sql.includes('-- destructive')) {
      db.pragma('wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(file, `${file}.bak-${current}`);
    }
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
  ensureDefaultProfile(db);
  return db;
}
