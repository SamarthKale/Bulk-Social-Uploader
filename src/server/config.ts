import path from 'node:path';
import fs from 'node:fs';

export function dataDir(): string {
  const dir = process.env.LOCALTUBE_DATA ?? path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export const PORT = Number(process.env.PORT ?? 4317);
