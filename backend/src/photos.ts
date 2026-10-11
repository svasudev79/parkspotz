// Entry photos on local disk. Files get random server-chosen names and are
// only ever sent out through GET /visits/:id/photo after an access check.
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

const TYPES = [
  { ext: "jpg", mime: "image/jpeg" },
  { ext: "png", mime: "image/png" },
  { ext: "webp", mime: "image/webp" },
] as const;

// Works out the image type from the file's first bytes (never from the
// content-type header or a file name). Returns null for anything else.
export function detectImage(data: Buffer): (typeof TYPES)[number] | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return TYPES[0];
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return TYPES[1];
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return TYPES[2];
  }
  return null;
}

export async function savePhoto(data: Buffer, ext: string): Promise<string> {
  await mkdir(config.uploadsDir, { recursive: true });
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  await writeFile(join(config.uploadsDir, name), data, { flag: "wx" });
  return name;
}

export async function deletePhoto(name: string | null): Promise<void> {
  if (name) await unlink(join(config.uploadsDir, name)).catch(() => {});
}

// Stored names are always "<32 hex>.<ext>"; anything else is refused.
export function photoFile(name: string): { path: string; mime: string } | null {
  const match = /^[0-9a-f]{32}\.(jpg|png|webp)$/.exec(name);
  const type = match && TYPES.find((t) => t.ext === match[1]);
  return type ? { path: join(config.uploadsDir, name), mime: type.mime } : null;
}
