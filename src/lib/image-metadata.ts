/**
 * Remove metadata (EXIF, GPS, XMP, IPTC, comments, text chunks) from a public
 * image before it is stored where anyone can read it (profile photos,
 * docs/REGISTRATION_ONBOARDING_FLOW.md).
 *
 * Lossless: the encoded pixels are copied byte for byte; only metadata
 * segments/chunks are dropped, so quality is untouched. Nothing is decoded,
 * which keeps this dependency-free and safe on hostile input (every length is
 * bounds-checked; anything malformed returns null and the caller refuses the
 * file).
 *
 * - JPEG: keeps SOI, APP0 (JFIF), APP2 ICC_PROFILE (colour), APP14 (Adobe colour
 *   transform), and every non-APP marker. Drops APP1 (EXIF and XMP; GPS lives
 *   in EXIF), the other APPn (IPTC/Photoshop, MPF with its embedded EXIF
 *   thumbnails, vendor blocks) and COM. Stops at EOI and drops anything after
 *   it. If the original EXIF said the photo is rotated, a minimal EXIF block
 *   holding ONLY the orientation tag is written back, so phone photos are not
 *   shown sideways; it carries no location, device, date or other data.
 * - PNG: drops eXIf, tEXt, zTXt, iTXt and tIME chunks, and anything after IEND.
 * - WebP: drops the EXIF and XMP chunks, clears their VP8X flags, fixes the
 *   RIFF size, and drops anything after the RIFF payload.
 *
 * Pure — tested in image-metadata.test.ts, and checked against real files
 * with an independent reader (scripts/isolated-validation/exif-strip-check.py).
 */

export type StripResult = { bytes: Uint8Array; removed: string[]; orientation: number | null };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u32le = (b: Uint8Array, i: number) => b[i] + (b[i + 1] << 8) + (b[i + 2] << 16) + ((b[i + 3] << 24) >>> 0);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** The orientation tag (0x0112) of an EXIF APP1 payload ("Exif\0\0" + TIFF), or null. */
export function exifOrientation(payload: Uint8Array): number | null {
  if (payload.length < 14 || ascii(payload, 0, 6) !== "Exif\0\0") return null;
  const t = payload.subarray(6);
  const le = ascii(t, 0, 2) === "II";
  if (!le && ascii(t, 0, 2) !== "MM") return null;
  const r16 = (i: number) => (le ? t[i] | (t[i + 1] << 8) : (t[i] << 8) | t[i + 1]);
  const r32 = (i: number) => (le ? u32le(t, i) : u32be(t, i));
  if (r16(2) !== 42) return null;
  const ifd = r32(4);
  if (ifd + 2 > t.length) return null;
  const count = r16(ifd);
  for (let k = 0; k < count && k < 512; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > t.length) return null;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** A minimal APP1 segment holding only an orientation tag (big-endian TIFF). */
export function orientationOnlyApp1(orientation: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const payload = [...[0x45, 0x78, 0x69, 0x66, 0, 0], ...tiff];
  const len = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
}

function stripJpeg(b: Uint8Array): StripResult | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  const removed: string[] = [];
  let orientation: number | null = null;
  let i = 2;
  let afterApp0 = -1; // index in parts where the orientation block goes
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    while (i < b.length && b[i] === 0xff) i++; // fill bytes
    if (i >= b.length) return null;
    const marker = b[i];
    const start = i - 1;
    i++;
    if (marker === 0xd9) {
      parts.push(Uint8Array.of(0xff, 0xd9)); // EOI: anything after it is dropped
      if (i < b.length) removed.push("trailer");
      return finish();
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(b.subarray(start, i));
      continue;
    }
    if (i + 2 > b.length) return null;
    const len = u16be(b, i);
    if (len < 2 || i + len > b.length) return null;
    const segEnd = i + len;
    const payload = b.subarray(i + 2, segEnd);
    let keep = true;
    if (marker === 0xe1) {
      keep = false;
      const o = exifOrientation(payload);
      if (o) orientation = o;
      removed.push(ascii(payload, 0, 4) === "Exif" ? "exif" : "xmp");
    } else if (marker === 0xe2) {
      keep = ascii(payload, 0, 12) === "ICC_PROFILE\0";
      if (!keep) removed.push("app2");
    } else if (marker === 0xe0 || marker === 0xee) {
      keep = true;
    } else if (marker >= 0xe3 && marker <= 0xef) {
      keep = false;
      removed.push(marker === 0xed ? "iptc" : `app${marker - 0xe0}`);
    } else if (marker === 0xfe) {
      keep = false;
      removed.push("comment");
    }
    if (keep) {
      parts.push(b.subarray(start, segEnd));
      if (marker === 0xe0 && afterApp0 < 0) afterApp0 = parts.length;
    }
    i = segEnd;
    if (marker === 0xda) {
      // Entropy-coded data: copy until the next real marker (not stuffing, not RSTn).
      const dataStart = i;
      while (i < b.length) {
        if (b[i] === 0xff && i + 1 < b.length) {
          const n = b[i + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) {
            i += n === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        i++;
      }
      parts.push(b.subarray(dataStart, i));
    }
  }
  return null; // no EOI

  function finish(): StripResult {
    if (orientation && orientation !== 1) parts.splice(afterApp0 >= 0 ? afterApp0 : 1, 0, orientationOnlyApp1(orientation));
    return { bytes: concat(parts), removed, orientation };
  }
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(b: Uint8Array): StripResult | null {
  if (b.length < 8 || !PNG_SIG.every((v, k) => b[k] === v)) return null;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  const removed: string[] = [];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length || !/^[A-Za-z]{4}$/.test(type)) return null;
    if (PNG_DROP.has(type)) removed.push(type);
    else parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") {
      if (i < b.length) removed.push("trailer");
      return { bytes: concat(parts), removed, orientation: null };
    }
  }
  return null; // no IEND
}

function stripWebp(b: Uint8Array): StripResult | null {
  if (b.length < 12 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const riffEnd = 8 + u32le(b, 4);
  if (riffEnd > b.length || riffEnd < 12) return null;
  const chunks: Uint8Array[] = [];
  const removed: string[] = [];
  let vp8x: Uint8Array | null = null;
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, 4);
    const len = u32le(b, i + 4);
    const end = i + 8 + len + (len & 1);
    if (i + 8 + len > riffEnd) return null;
    if (type === "EXIF" || type === "XMP ") removed.push(type.trim().toLowerCase());
    else {
      const chunk = b.slice(i, Math.min(end, riffEnd));
      if (type === "VP8X") vp8x = chunk;
      chunks.push(chunk);
    }
    i = end;
  }
  if (vp8x && vp8x.length >= 9) vp8x[8] &= ~(0x08 | 0x04); // EXIF and XMP flags
  if (riffEnd < b.length) removed.push("trailer");
  const body = concat(chunks);
  const size = 4 + body.length;
  const head = Uint8Array.from([0x52, 0x49, 0x46, 0x46, size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff, 0x57, 0x45, 0x42, 0x50]);
  return { bytes: concat([head, body]), removed, orientation: null };
}

/** Strip metadata from a JPEG, PNG or WebP. Null when the file is not one of these or is malformed. */
export function stripImageMetadata(bytes: Uint8Array, type: string): StripResult | null {
  if (type === "image/jpeg") return stripJpeg(bytes);
  if (type === "image/png") return stripPng(bytes);
  if (type === "image/webp") return stripWebp(bytes);
  return null;
}
