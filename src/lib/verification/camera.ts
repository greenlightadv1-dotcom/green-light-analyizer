/**
 * Server-side checks for a creator's identity images (selfie, ID front, ID
 * back), which the page captures with the device camera and encodes as JPEG
 * on a canvas.
 *
 * What this can and cannot establish, stated plainly:
 * - It CAN reject anything that is not a well-formed JPEG within size and
 *   dimension bounds, and anything whose EXIF (APP1 "Exif") segment carries
 *   camera metadata: make, model, capture date, exposure settings or GPS.
 *   Camera-app and phone-gallery photos almost always carry those. A browser
 *   canvas never does, but Safari on iOS/macOS still writes a small EXIF
 *   block on canvas JPEGs (colour space, pixel size), so EXIF alone is not a
 *   sign of a gallery photo. A malformed EXIF block is refused.
 * - It CANNOT prove the image came from a live camera. A determined person
 *   can strip EXIF from a gallery photo. This is Live Camera Capture as a
 *   user-interface flow, NOT liveness detection, face matching or proof that
 *   a person was present (docs/CREATOR_KYC_SPEC.md).
 *
 * Pure — tested in camera.test.ts.
 */

export const CAMERA_DOC_TYPES = ["selfie", "id_front", "id_back"] as const;
export type CameraDocType = (typeof CAMERA_DOC_TYPES)[number];

export function isCameraDocType(v: string): v is CameraDocType {
  return (CAMERA_DOC_TYPES as readonly string[]).includes(v);
}

/** Bounds for what the capture component produces (it scales to ≤ 1600 px). */
export const CAMERA_LIMITS = { minWidth: 320, minHeight: 240, maxSide: 4096, maxBytes: 5 * 1024 * 1024 } as const;

export type CameraCheck =
  | { ok: true; width: number; height: number }
  | { ok: false; error: "type" | "not_camera" | "too_small" | "too_large" | "corrupt" };

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function checkCameraJpeg(bytes: Uint8Array): CameraCheck {
  if (bytes.length === 0) return { ok: false, error: "corrupt" };
  if (bytes.length > CAMERA_LIMITS.maxBytes) return { ok: false, error: "too_large" };
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { ok: false, error: "type" };
  let i = 2;
  let width = 0;
  let height = 0;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return { ok: false, error: "corrupt" };
    const marker = bytes[i + 1];
    if (marker === 0xff) { i += 1; continue; } // fill byte
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    if (marker === 0xd9) break; // end of image
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) return { ok: false, error: "corrupt" };
    const seg = i + 4;
    if (marker === 0xe1 && len >= 8 && bytes[seg] === 0x45 && bytes[seg + 1] === 0x78 && bytes[seg + 2] === 0x69 && bytes[seg + 3] === 0x66 && bytes[seg + 4] === 0 && bytes[seg + 5] === 0) {
      if (exifHasCameraMetadata(bytes.subarray(seg + 6, i + 2 + len))) return { ok: false, error: "not_camera" };
    }
    if (SOF.has(marker)) {
      if (len < 7) return { ok: false, error: "corrupt" };
      height = (bytes[seg + 1] << 8) | bytes[seg + 2];
      width = (bytes[seg + 3] << 8) | bytes[seg + 4];
    }
    if (marker === 0xda) break; // start of scan: headers are over
    i += 2 + len;
  }
  if (!width || !height) return { ok: false, error: "corrupt" };
  if (width < CAMERA_LIMITS.minWidth || height < CAMERA_LIMITS.minHeight) return { ok: false, error: "too_small" };
  if (width > CAMERA_LIMITS.maxSide || height > CAMERA_LIMITS.maxSide) return { ok: false, error: "too_large" };
  return { ok: true, width, height };
}

/**
 * Tags only a camera or a photo library writes. Safari's canvas encoder
 * writes none of them (it writes colour space and pixel dimensions).
 */
const CAMERA_TAGS = new Set([
  0x010f, // Make
  0x0110, // Model
  0x0132, // DateTime
  0x8825, // GPS IFD pointer
  0x829a, // ExposureTime
  0x829d, // FNumber
  0x8827, // ISO
  0x9003, // DateTimeOriginal
  0x9004, // DateTimeDigitized
  0x920a, // FocalLength
  0xa433, // LensMake
  0xa434, // LensModel
]);
const EXIF_IFD_POINTER = 0x8769;

/** True when the TIFF block carries camera metadata, or cannot be read. */
export function exifHasCameraMetadata(tiff: Uint8Array): boolean {
  if (tiff.length < 8) return true;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return true;
  const u16 = (o: number) => (little ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1]);
  const u32 = (o: number) =>
    (little
      ? tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16) | (tiff[o + 3] << 24)
      : (tiff[o] << 24) | (tiff[o + 1] << 16) | (tiff[o + 2] << 8) | tiff[o + 3]) >>> 0;
  if (u16(2) !== 0x2a) return true;

  const visited = new Set<number>();
  const walk = (offset: number, depth: number): boolean => {
    if (depth > 2 || visited.has(offset)) return true;
    visited.add(offset);
    if (offset < 8 || offset + 2 > tiff.length) return true;
    const count = u16(offset);
    if (count > 512 || offset + 2 + count * 12 > tiff.length) return true;
    for (let n = 0; n < count; n++) {
      const e = offset + 2 + n * 12;
      const tag = u16(e);
      if (CAMERA_TAGS.has(tag)) return true;
      if (tag === EXIF_IFD_POINTER && walk(u32(e + 8), depth + 1)) return true;
    }
    return false;
  };
  return walk(u32(4), 0);
}
