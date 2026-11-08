import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { hmac, safeEqual } from './crypto.js';

export type FileKind = 'photo' | 'event';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Private photo storage on the server. Files are only reachable through signed URLs. */
export class Storage {
  constructor(
    private readonly root: string,
    private readonly signingSecret: string,
  ) {}

  abs(relPath: string) {
    const full = path.resolve(this.root, relPath);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('path escapes storage root');
    return full;
  }

  /** Strip all metadata (EXIF/GPS), apply orientation, resize, re-encode as JPEG, save. */
  async saveImage(relPath: string, input: Buffer) {
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    const full = this.abs(relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return { width: info.width, height: info.height };
  }

  read(relPath: string) {
    return fs.readFile(this.abs(relPath));
  }

  async remove(relPath: string) {
    await fs.rm(this.abs(relPath), { force: true });
  }

  async removeMoveDir(moveId: string) {
    await fs.rm(this.abs(moveId), { recursive: true, force: true });
  }

  signedUrl(kind: FileKind, id: string, now = Date.now()) {
    const exp = Math.floor(now / 1000) + SIGNED_URL_TTL_SECONDS;
    const sig = hmac(this.signingSecret, `${kind}:${id}:${exp}`);
    return `/files/${kind}/${id}?exp=${exp}&sig=${sig}`;
  }

  verify(kind: FileKind, id: string, exp: string | undefined, sig: string | undefined, now = Date.now()) {
    if (!exp || !sig || !/^\d+$/.test(exp)) return false;
    if (Number(exp) * 1000 < now) return false;
    return safeEqual(sig, hmac(this.signingSecret, `${kind}:${id}:${exp}`));
  }
}
