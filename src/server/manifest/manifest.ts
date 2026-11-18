import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/db.js';
import { logActivity } from '../activity.js';
import { validateMetadata } from '../ai/metadataSchema.js';
import type { Folder } from '../folders/folderRepo.js';

/** One entry of a clip manifest (the JSON written by the clipper): the file plus its ready-made text. */
export interface ManifestClip {
  file: string;
  title: string;
  description: string;
  hashtags: string[];
}

export interface ImportResult {
  /** Entries that matched at least one video. */
  matched: number;
  applied: number;
  unchanged: number;
  /** Videos left alone: already uploading/uploaded, or titled by the user. */
  skipped: number;
  /** Manifest entries with no matching video file in the folder. */
  unmatched: string[];
  errors: { file: string; reason: string }[];
}

export interface DiscoverResult extends ImportResult {
  /** Manifest files that were read, relative to the folder. */
  files: string[];
}

const MAX_JSON_BYTES = 20 * 1024 * 1024;
const HASHTAG = /^#[\p{L}\p{N}_]+$/u;
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information']);
const emptyResult = (): ImportResult => ({ matched: 0, applied: 0, unchanged: 0, skipped: 0, unmatched: [], errors: [] });

/**
 * Reads a clip manifest: either {clips: [...]} or a bare array. Each entry needs a `file` and a title
 * (`post_title` or `title`). Entries missing either are skipped; a document with no clip list throws.
 */
export function parseManifest(raw: unknown): ManifestClip[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? (raw as { clips?: unknown }).clips : undefined;
  if (!Array.isArray(list)) throw new Error('Not a clip manifest: expected a "clips" list');
  const out: ManifestClip[] = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const title = typeof o.post_title === 'string' && o.post_title.trim() ? o.post_title : typeof o.title === 'string' ? o.title : '';
    if (typeof o.file !== 'string' || !o.file.trim() || !title.trim()) continue;
    out.push({
      file: o.file.trim(),
      title,
      description: typeof o.description === 'string' ? o.description : '',
      hashtags: Array.isArray(o.hashtags) ? o.hashtags.filter((h): h is string => typeof h === 'string') : [],
    });
  }
  return out;
}

const cleanTags = (tags: string[]) =>
  tags
    .map((t) => t.trim().replace(/\s+/g, ''))
    .map((t) => (t && !t.startsWith('#') ? `#${t}` : t))
    .filter((t) => HASHTAG.test(t));

const lower = (s: string) => s.toLowerCase();
const within = (file: string, dir: string) => lower(file).startsWith(lower(dir.replace(/[\\/]+$/, '')) + path.sep);

/**
 * Writes manifest titles/descriptions/hashtags as READY metadata for matching videos (matched by file
 * name, case-insensitively). It never touches the files. A title the user edited by hand is kept, a
 * video that is uploading or uploaded is left alone, and re-running with the same data changes nothing.
 */
export function applyManifest(db: Db, folderId: number, clips: ManifestClip[], opts: { dir?: string } = {}): ImportResult {
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId) as Folder | undefined;
  if (!folder) throw new Error(`folder ${folderId} not found`);
  const r = emptyResult();
  const unmatched = new Set<string>();

  for (const c of clips) {
    let videos = db.prepare('SELECT id, file_path, upload_status, approval_status, content_hash FROM videos WHERE folder_id = ? AND lower(filename) = lower(?)').all(folderId, c.file) as {
      id: number; file_path: string; upload_status: string; approval_status: string; content_hash: string | null;
    }[];
    if (opts.dir) videos = videos.filter((v) => within(v.file_path, opts.dir!));
    if (!videos.length) {
      unmatched.add(c.file);
      continue;
    }
    const v = validateMetadata({ title: c.title, description: c.description, hashtags: cleanTags(c.hashtags), confidence: 'high', needsReview: false });
    if (!v.ok) {
      r.errors.push({ file: c.file, reason: v.errors.join('; ') });
      continue;
    }
    r.matched++;
    const meta = v.value;

    for (const video of videos) {
      if (['UPLOADING', 'UPLOAD_COMPLETE', 'UPLOAD_OUTCOME_UNKNOWN'].includes(video.upload_status)) {
        r.skipped++;
        continue;
      }
      const cur = db.prepare('SELECT id, provider, title, description, hashtags_json FROM video_metadata WHERE video_id = ? AND is_current = 1').get(video.id) as
        | { id: number; provider: string | null; title: string; description: string; hashtags_json: string }
        | undefined;
      if (cur?.provider === 'user-edit') {
        r.skipped++;
        continue;
      }
      if (cur?.provider === 'manifest' && cur.title === meta.title && cur.description === meta.description && cur.hashtags_json === JSON.stringify(meta.hashtags)) {
        r.unchanged++;
        continue;
      }
      db.transaction(() => {
        db.prepare('UPDATE video_metadata SET is_current = 0 WHERE video_id = ?').run(video.id);
        db.prepare(
          `INSERT INTO video_metadata(video_id, ai_profile_id, provider, model, title, description, hashtags_json, category_id, confidence, needs_review, is_current, content_hash)
           VALUES(?,?, 'manifest', 'clip json', ?,?,?,?, 'high', 0, 1, ?)`,
        ).run(video.id, folder.ai_profile_id, meta.title, meta.description, JSON.stringify(meta.hashtags), folder.default_category_id, video.content_hash);
        const keep = video.approval_status === 'REJECTED' || video.approval_status === 'APPROVED';
        db.prepare("UPDATE videos SET metadata_status = 'READY', approval_status = ?, updated_at = datetime('now') WHERE id = ?").run(
          keep ? video.approval_status : folder.auto_publish ? 'NOT_REQUIRED' : 'PENDING',
          video.id,
        );
      })();
      r.applied++;
    }
  }
  r.unmatched = [...unmatched];
  if (r.applied) logActivity(db, 'folder', folderId, 'manifest_imported', `Imported titles and descriptions for ${r.applied} video(s) from the clip JSON`);
  return r;
}

async function* jsonFiles(dir: string, recursive: boolean): AsyncGenerator<string> {
  let handle: fs.Dir;
  try {
    handle = await fs.promises.opendir(dir);
  } catch {
    return;
  }
  for await (const entry of handle) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name.toLowerCase())) yield* jsonFiles(full, recursive);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json') && !entry.name.startsWith('.')) {
      yield full;
    }
  }
}

/**
 * Looks for clip manifests (any *.json with a clips list) inside the folder and imports each one for
 * the videos next to it. Unrelated or broken JSON files are ignored. Read-only on disk.
 */
export async function discoverManifests(db: Db, folderId: number): Promise<DiscoverResult> {
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId) as Folder | undefined;
  const total: DiscoverResult = { ...emptyResult(), files: [] };
  if (!folder) return total;
  const unmatched = new Set<string>();
  for await (const file of jsonFiles(folder.path, !!folder.recursive_scan)) {
    let clips: ManifestClip[];
    try {
      const st = await fs.promises.stat(file);
      if (st.size > MAX_JSON_BYTES) continue;
      clips = parseManifest(JSON.parse(await fs.promises.readFile(file, 'utf8')));
    } catch {
      continue; // not a manifest, or unreadable
    }
    if (!clips.length) continue;
    const r = applyManifest(db, folderId, clips, { dir: path.dirname(file) });
    total.files.push(path.relative(folder.path, file).split(path.sep).join('/'));
    total.matched += r.matched;
    total.applied += r.applied;
    total.unchanged += r.unchanged;
    total.skipped += r.skipped;
    total.errors.push(...r.errors);
    r.unmatched.forEach((u) => unmatched.add(u));
  }
  total.unmatched = [...unmatched];
  return total;
}
