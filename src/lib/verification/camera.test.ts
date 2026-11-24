import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCameraJpeg, exifHasCameraMetadata, isCameraDocType, CAMERA_LIMITS } from "./camera.ts";

function seg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
}
/** A big-endian TIFF block with one IFD0 holding the given tags (value 0). */
function tiff(tags: number[], exifIfdTags?: number[]): number[] {
  const entries = [...tags, ...(exifIfdTags ? [0x8769] : [])];
  const ifd0Len = 2 + entries.length * 12 + 4;
  const exifOffset = 8 + ifd0Len;
  const out = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, entries.length];
  for (const tag of entries) {
    const value = tag === 0x8769 ? exifOffset : 0;
    out.push(tag >> 8, tag & 0xff, 0, 4, 0, 0, 0, 1, (value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  }
  out.push(0, 0, 0, 0);
  if (exifIfdTags) {
    out.push(0, exifIfdTags.length);
    for (const tag of exifIfdTags) out.push(tag >> 8, tag & 0xff, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0);
    out.push(0, 0, 0, 0);
  }
  return out;
}
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0];

function jpeg({ width = 1280, height = 720, exif = false, exifBlock }: { width?: number; height?: number; exif?: boolean; exifBlock?: number[] } = {}): Uint8Array {
  const parts = [0xff, 0xd8];
  parts.push(...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])); // APP0 JFIF (what a canvas writes)
  if (exif) parts.push(...seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a])); // APP1 Exif, truncated (malformed)
  if (exifBlock) parts.push(...seg(0xe1, [...EXIF_HEADER, ...exifBlock]));
  parts.push(...seg(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]));
  parts.push(...seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]));
  parts.push(0x12, 0x34, 0xff, 0xd9);
  return new Uint8Array(parts);
}

test("a canvas-style JPEG within bounds is accepted, with its dimensions", () => {
  assert.deepEqual(checkCameraJpeg(jpeg()), { ok: true, width: 1280, height: 720 });
  assert.deepEqual(checkCameraJpeg(jpeg({ width: 640, height: 480 })), { ok: true, width: 640, height: 480 });
});

test("a malformed EXIF block is refused", () => {
  assert.deepEqual(checkCameraJpeg(jpeg({ exif: true })), { ok: false, error: "not_camera" });
});

test("camera metadata in EXIF (make, model, dates, GPS, exposure) is refused", () => {
  for (const tag of [0x010f, 0x0110, 0x0132, 0x8825]) {
    assert.deepEqual(checkCameraJpeg(jpeg({ exifBlock: tiff([0x0112, tag]) })), { ok: false, error: "not_camera" }, tag.toString(16));
  }
  for (const tag of [0x9003, 0x829a, 0xa434]) {
    assert.deepEqual(checkCameraJpeg(jpeg({ exifBlock: tiff([0x0112], [0xa001, tag]) })), { ok: false, error: "not_camera" }, tag.toString(16));
  }
});

test("Safari's canvas EXIF (orientation, colour space, pixel size only) is accepted", () => {
  // iOS Safari writes this on canvas.toBlob('image/jpeg') captures.
  const block = tiff([0x0112, 0x011a, 0x011b, 0x0128], [0xa001, 0xa002, 0xa003]);
  assert.deepEqual(checkCameraJpeg(jpeg({ exifBlock: block })), { ok: true, width: 1280, height: 720 });
  assert.equal(exifHasCameraMetadata(new Uint8Array(block)), false);
});

test("an EXIF IFD pointer loop is treated as malformed", () => {
  const block = tiff([0x0112], [0xa001]);
  // Point the Exif IFD back at IFD0.
  block[10 + 12 + 8 + 3] = 8;
  block[10 + 12 + 8 + 2] = 0;
  assert.equal(exifHasCameraMetadata(new Uint8Array(block)), true);
});

test("PNG, PDF, WebP, empty and truncated files are refused", () => {
  assert.equal(checkCameraJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).ok, false);
  assert.deepEqual(checkCameraJpeg(new TextEncoder().encode("%PDF-1.7")), { ok: false, error: "type" });
  assert.deepEqual(checkCameraJpeg(new Uint8Array([])), { ok: false, error: "corrupt" });
  const full = jpeg();
  assert.equal(checkCameraJpeg(full.subarray(0, 30)).ok, false);
  // Magic bytes alone, with no frame header, are not an image.
  assert.deepEqual(checkCameraJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), { ok: false, error: "corrupt" });
});

test("too small to read or implausibly large frames are refused", () => {
  assert.deepEqual(checkCameraJpeg(jpeg({ width: 200, height: 150 })), { ok: false, error: "too_small" });
  assert.deepEqual(checkCameraJpeg(jpeg({ width: 8000, height: 4000 })), { ok: false, error: "too_large" });
  const big = new Uint8Array(CAMERA_LIMITS.maxBytes + 1);
  big[0] = 0xff; big[1] = 0xd8;
  assert.deepEqual(checkCameraJpeg(big), { ok: false, error: "too_large" });
});

test("a segment length that runs past the end is refused, not read out of bounds", () => {
  const bad = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0x00]);
  assert.deepEqual(checkCameraJpeg(bad), { ok: false, error: "corrupt" });
});

test("only selfie and the two ID sides are camera documents", () => {
  for (const d of ["selfie", "id_front", "id_back"]) assert.ok(isCameraDocType(d));
  for (const d of ["passport", "commercial_register", "tax_card", "authorization_letter", "other", ""]) assert.ok(!isCameraDocType(d));
});
