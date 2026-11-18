import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fixture } from '../fixtures/make-fixtures';

let server: ChildProcess;
let url = '';
let videosDir = '';

test.beforeAll(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-ui-data-'));
  videosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-ui-videos-'));
  fs.copyFileSync(fixture('short'), path.join(videosDir, 'my clip.mp4'));
  server = spawn(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), 'src/server/index.ts'], {
    env: { ...process.env, LOCALTUBE_DATA: data, PORT: '4519', LOCALTUBE_NO_OPEN: '1', LOCALTUBE_TEST_PICK_DIR: videosDir },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  url = await new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 30_000);
    server.stdout!.on('data', (d: Buffer) => {
      const m = d.toString().match(/LocalTube running: (\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    server.on('exit', (c) => reject(new Error(`server exited early (${c})`)));
  });
});
test.afterAll(() => {
  server?.kill();
});

test('add a folder, scan it, edit metadata by hand, and never expose the API key', async ({ page }) => {
  await page.goto(url);

  // The launch token is removed from the address bar after load.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect.poll(() => page.url()).not.toContain('token=');
  await expect(page.getByText('No data yet')).toBeVisible();

  // Folders: add through the (stubbed) folder dialog, then scan.
  await page.getByRole('link', { name: 'Folders' }).click();
  await page.getByRole('button', { name: 'Add folder' }).click();
  await expect(page.getByTestId('folder-name')).toHaveText(path.basename(videosDir));
  await page.getByRole('button', { name: 'Scan now' }).click();
  await expect(page.getByTestId('scan-result')).toContainText('Found 1', { timeout: 30_000 });

  // Library: the video is listed with its duration.
  await page.getByRole('link', { name: 'Video Library' }).click();
  const row = page.getByTestId('video-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('my clip.mp4');
  await expect(row).toContainText('0:01');

  // Edit metadata by hand, save, reload, and see it persisted.
  await row.getByRole('button', { name: 'my clip.mp4' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit metadata' });
  await dialog.getByLabel(/^Title/).fill('Insane 1v4 clutch');
  await dialog.getByLabel('Description').fill('Watch this comeback.');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByText('Saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('video-row')).toContainText('Insane 1v4 clutch');

  // Settings: the Gemini key is write-only and never shown back.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Gemini API key').fill('SECRET-KEY-VALUE-123');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByRole('status')).toContainText('API key saved');
  await page.reload();
  await expect(page.getByText('saved; enter a new one to replace')).toBeVisible();
  expect(await page.content()).not.toContain('SECRET-KEY-VALUE-123');
  expect(await page.getByLabel('Gemini API key').inputValue()).toBe('');

  // The source video was never touched.
  expect(fs.readdirSync(videosDir)).toEqual(['my clip.mp4']);
});
