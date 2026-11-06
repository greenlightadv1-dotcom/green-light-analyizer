/**
 * Upload validation (feature 4). The server trusts neither the file name nor
 * the browser's declared type: it reads the first bytes and accepts only the
 * formats each upload kind allows, then writes under the owner's own folder.
 *
 * Pure — unit-tested in uploads.test.ts.
 */

export type UploadKind = "avatar" | "document";
export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export const UPLOAD_RULES: Record<UploadKind, { bucket: string; maxBytes: number; types: readonly SniffedType[] }> = {
  // Matches the bucket limits in migration 0024.
  avatar: { bucket: "avatars", maxBytes: 2 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] },
  document: {
    bucket: "creator-documents",
    maxBytes: 5 * 1024 * 1024,
    types: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  },
};

export const EXTENSION: Record<SniffedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Identify a file by its magic bytes. Returns null for anything else. */
export function sniffType(bytes: Uint8Array): SniffedType | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 12 && b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) {
    return "image/webp";
  }
  if (bytes.length >= 5 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d) return "application/pdf";
  return null;
}

export type UploadCheck = { ok: true; type: SniffedType } | { ok: false; error: "empty" | "too_large" | "type" };

export function checkUpload(kind: UploadKind, size: number, head: Uint8Array): UploadCheck {
  const rule = UPLOAD_RULES[kind];
  if (size <= 0) return { ok: false, error: "empty" };
  if (size > rule.maxBytes) return { ok: false, error: "too_large" };
  const type = sniffType(head);
  if (!type || !rule.types.includes(type)) return { ok: false, error: "type" };
  return { ok: true, type };
}

/** A display-safe file name: letters, digits, dot, dash and underscore only. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "").slice(0, 80);
  return cleaned || "file";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True only for a storage path inside this owner's own folder: exactly
 * "<owner uuid>/<file>", no traversal, no nested folders.
 */
export function isOwnedPath(ownerId: string, path: string): boolean {
  if (!UUID.test(ownerId)) return false;
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === ownerId && /^[A-Za-z0-9._-]{1,120}$/.test(parts[1]) && !parts[1].startsWith(".");
}

/** The object path an avatar URL points at, if it is one of ours in this owner's folder. */
export function ownedAvatarPath(ownerId: string, url: string | null, publicBase: string): string | null {
  if (!url || !url.startsWith(publicBase)) return null;
  const path = decodeURIComponent(url.slice(publicBase.length).split("?")[0]);
  return isOwnedPath(ownerId, path) ? path : null;
}
