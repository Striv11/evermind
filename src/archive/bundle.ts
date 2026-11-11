/** Export/import of an archive as a ZIP: archive.json, attachments/*, and a standalone viewer.html. */
import type { Archive } from './schema';
import { validateArchive } from './validate';
import { readZip, writeZip } from './zip';
import { viewerHtml } from './viewer';

export class BundleError extends Error {}

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `files` maps an attachment's `path` to its bytes. Every declared attachment must be present and match. */
export async function exportBundle(
  archive: Archive,
  files: Map<string, Uint8Array> = new Map(),
): Promise<Uint8Array> {
  const v = validateArchive(archive);
  if (!v.ok)
    throw new BundleError(`archive is invalid: ${v.issues[0]!.path} ${v.issues[0]!.message}`);
  const out = new Map<string, Uint8Array>();
  out.set('archive.json', enc.encode(JSON.stringify(archive, null, 2)));
  out.set('viewer.html', enc.encode(viewerHtml(archive)));
  for (const ref of archive.attachments) {
    const bytes = files.get(ref.path);
    if (!bytes) throw new BundleError(`missing attachment bytes: ${ref.path}`);
    await checkAttachment(ref, bytes);
    out.set(ref.path, bytes);
  }
  return writeZip(out);
}

async function checkAttachment(
  ref: Archive['attachments'][number],
  bytes: Uint8Array,
): Promise<void> {
  if (bytes.length !== ref.bytes)
    throw new BundleError(`size mismatch for ${ref.path}: ${bytes.length} != ${ref.bytes}`);
  if ((await sha256Hex(bytes)) !== ref.sha256)
    throw new BundleError(`sha256 mismatch for ${ref.path}`);
}

export async function importBundle(
  zip: Uint8Array,
): Promise<{ archive: Archive; files: Map<string, Uint8Array> }> {
  let entries: Map<string, Uint8Array>;
  try {
    entries = readZip(zip);
  } catch (e) {
    throw new BundleError(e instanceof Error ? e.message : 'unreadable zip');
  }
  const json = entries.get('archive.json');
  if (!json) throw new BundleError('archive.json not found in bundle');
  let parsed: unknown;
  try {
    parsed = JSON.parse(dec.decode(json));
  } catch {
    throw new BundleError('archive.json is not valid JSON');
  }
  const v = validateArchive(parsed);
  if (!v.ok)
    throw new BundleError(`archive is invalid: ${v.issues[0]!.path} ${v.issues[0]!.message}`);
  const files = new Map<string, Uint8Array>();
  for (const ref of v.archive.attachments) {
    const bytes = entries.get(ref.path);
    if (!bytes) throw new BundleError(`missing attachment: ${ref.path}`);
    await checkAttachment(ref, bytes);
    files.set(ref.path, bytes);
  }
  return { archive: v.archive, files };
}
