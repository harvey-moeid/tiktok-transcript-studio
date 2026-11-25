/** On-disk cache for the binaries and model weights we fetch on demand. */

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export function cacheDir(...parts: string[]): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "anytranscript", ...parts);
}
export async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}
export class IntegrityError extends Error {
  constructor(label: string, expected: string, actual: string) {
    super(`checksum mismatch for ${label}\n expected ${expected}\n actual ${actual}\nThe download was discarded; do not disable verification.`);
    this.name = "IntegrityError";
  }
}
class MissingChecksumError extends Error {
  constructor(label: string) { super(`No trusted SHA-256 checksum available for ${label}; refusing to download in strict mode.`); this.name = "MissingChecksumError"; }
}
async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}
export interface DownloadOptions { mode?: number; sha256?: string; onProgress?: (message: string) => void; label?: string; }
const inFlight = new Map<string, Promise<string>>();
export async function ensureDownloaded(url: string, dest: string, options: DownloadOptions = {}): Promise<string> {
  if (await exists(dest)) return dest;
  let pending = inFlight.get(dest);
  if (!pending) { pending = download(url, dest, options).finally(() => inFlight.delete(dest)); inFlight.set(dest, pending); }
  return pending;
}
async function download(url: string, dest: string, { mode, sha256, onProgress, label }: DownloadOptions): Promise<string> {
  const name = label ?? url;
  if (process.env.ANYTRANSCRIPT_REQUIRE_CHECKSUM === "1" && !sha256) throw new MissingChecksumError(name);
  onProgress?.(`downloading ${name}...`);
  await mkdir(join(dest, ".."), { recursive: true });
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`failed to download ${name}: HTTP ${response.status} ${response.statusText}`);
  const partial = `${dest}.${randomUUID().slice(0, 8)}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    if (sha256) {
      const actual = await sha256File(partial);
      if (actual !== sha256.toLowerCase()) throw new IntegrityError(name, sha256, actual);
      onProgress?.(`verified ${name} (sha256 ${sha256.slice(0, 12)}...)`);
    }
    if (mode !== undefined) await chmod(partial, mode);
    await rename(partial, dest);
  } catch (error) { await rm(partial, { force: true }); throw error; }
  return dest;
}
export async function huggingFaceSha256(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "manual" });
    const digest = response.headers.get("x-linked-etag")?.replace(/^(W\/)?\"|\"$/g, "");
    return digest && /^[a-f0-9]{64}$/.test(digest) ? digest : undefined;
  } catch { return undefined; }
}
