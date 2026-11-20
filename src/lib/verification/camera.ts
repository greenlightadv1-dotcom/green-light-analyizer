/**
 * Server-side checks for a creator's identity images (selfie, ID front, ID
 * back), which the page captures with the device camera and encodes as JPEG
 * on a canvas.
 *
 * What this can and cannot establish, stated plainly:
 * - It CAN reject anything that is not a well-formed JPEG within size and
 *   dimension bounds, and anything carrying an EXIF (APP1 "Exif") segment.
 *   A browser canvas never writes EXIF, while phone-gallery and camera-app
 *   photos almost always do, so EXIF is a strong sign the file did not come
 *   from the in-page capture.
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
      return { ok: false, error: "not_camera" };
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
