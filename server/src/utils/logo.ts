import { access, mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
export const uploadsRoot = path.join(rootDir, 'uploads');
export const logosDir = path.join(uploadsRoot, 'logos');

const mimeByExt: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function ensureLogoDirs() {
  await mkdir(logosDir, { recursive: true });
}

export function publicLogoPath(filename: string) {
  return `/uploads/logos/${filename}`;
}

export function absoluteLogoPath(logoUrl?: string | null) {
  if (!logoUrl) return null;
  if (logoUrl.startsWith('/uploads/')) return path.join(rootDir, logoUrl.replace(/^\//, ''));
  if (logoUrl.startsWith('uploads/')) return path.join(rootDir, logoUrl);
  return null;
}

export async function removeLogoFile(logoUrl?: string | null) {
  const filePath = absoluteLogoPath(logoUrl);
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // ignore missing file
  }
}

export async function logoDataUri(logoUrl?: string | null) {
  if (!logoUrl) return undefined;
  if (logoUrl.startsWith('data:image/')) return logoUrl;
  const filePath = absoluteLogoPath(logoUrl);
  if (!filePath) return undefined;
  try {
    await access(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = mimeByExt[ext];
    if (!mime) return undefined;
    const buffer = await readFile(filePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}
