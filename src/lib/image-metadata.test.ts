import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { exifOrientation, orientationOnlyApp1, stripImageMetadata } from "./image-metadata.ts";

const seg = (marker: number, payload: number[] | Uint8Array) => {
  const p = [...payload];
  return [0xff, marker, (p.length + 2) >> 8, (p.length + 2) & 0xff, ...p];
};
const text = (s: string) => [...Buffer.from(s, "latin1")];
// A big-endian EXIF block: orientation 6 and a GPS-looking ASCII value.
const exif = (orientation: number) => [
  ...text("Exif\0\0"), 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 2,
  0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0,
  0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0x26,
  0, 0, 0, 0, ...text("GPS 30.0444N 31.2357E Cairo"),
];
const jpeg = (orientation = 6) =>
  Uint8Array.from([
    0xff, 0xd8,
    ...seg(0xe0, text("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    ...seg(0xe1, exif(orientation)),
    ...seg(0xe1, text("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>creator</x:xmpmeta>")),
    ...seg(0xe2, text("ICC_PROFILE\0\x01\x01colour")),
    ...seg(0xed, text("Photoshop 3.0\0IPTC location")),
    ...seg(0xfe, text("taken at home")),
    ...seg(0xdb, [0, ...Array(64).fill(1)]),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    0x12, 0xff, 0x00, 0x34, 0xff, 0xd3, 0x56,
    0xff, 0xd9,
    ...text("TRAILER GPS"),
  ]);

const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, "latin1"));

test("JPEG: EXIF, GPS, XMP, IPTC, comments and trailers are removed; pixels and colour kept", () => {
  const src = jpeg();
  const r = stripImageMetadata(src, "image/jpeg");
  assert.ok(r);
  for (const s of ["GPS", "Cairo", "xmpmeta", "IPTC", "taken at home", "TRAILER"]) assert.ok(!has(r.bytes, s), s);
  assert.ok(has(r.bytes, "JFIF") && has(r.bytes, "ICC_PROFILE"), "colour information kept");
  // The entropy-coded data (with its 0xFF00 stuffing and RST marker) is unchanged.
  assert.ok(Buffer.from(r.bytes).includes(Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd3, 0x56, 0xff, 0xd9])));
  assert.deepEqual(r.removed.sort(), ["comment", "exif", "iptc", "trailer", "xmp"]);
  // Only the orientation survives, in a fresh minimal block.
  assert.equal(r.orientation, 6);
  assert.ok(Buffer.from(r.bytes).includes(Buffer.from(orientationOnlyApp1(6))));
  // Idempotent.
  const again = stripImageMetadata(r.bytes, "image/jpeg");
  assert.ok(again);
  assert.deepEqual(Buffer.from(again.bytes), Buffer.from(r.bytes));
});

test("JPEG: an upright photo gets no EXIF block at all", () => {
  const r = stripImageMetadata(jpeg(1), "image/jpeg");
  assert.ok(r && !has(r.bytes, "Exif"));
  assert.equal(exifOrientation(Uint8Array.from(exif(3))), 3);
  assert.equal(exifOrientation(Uint8Array.from(text("Exif\0\0junk"))), null);
});

test("malformed files are refused, never passed through", () => {
  assert.equal(stripImageMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), "image/jpeg"), null);
  assert.equal(stripImageMetadata(jpeg().subarray(0, 60), "image/jpeg"), null);
  assert.equal(stripImageMetadata(Uint8Array.from(text("not an image")), "image/png"), null);
  assert.equal(stripImageMetadata(Uint8Array.from(text("%PDF-1.4")), "application/pdf"), null);
});

const chunk = (type: string, data: number[]) => {
  const n = data.length;
  return [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255, ...text(type), ...data, 0, 0, 0, 0];
};
test("PNG: text, EXIF and time chunks are removed; image chunks kept", () => {
  const src = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", Array(13).fill(1)),
    ...chunk("tEXt", text("GPS\0Cairo")),
    ...chunk("eXIf", text("MM\0*GPS")),
    ...chunk("iTXt", text("Author\0\0\0\0\0me")),
    ...chunk("tIME", [7, 234, 1, 1, 0, 0, 0]),
    ...chunk("IDAT", [1, 2, 3]),
    ...chunk("IEND", []),
    ...text("TRAILER"),
  ]);
  const r = stripImageMetadata(src, "image/png");
  assert.ok(r);
  for (const s of ["GPS", "Cairo", "Author", "tIME", "TRAILER"]) assert.ok(!has(r.bytes, s), s);
  assert.ok(has(r.bytes, "IHDR") && has(r.bytes, "IDAT") && has(r.bytes, "IEND"));
});

test("WebP: EXIF and XMP chunks are removed, their flags cleared, the size fixed", () => {
  const ch = (t: string, d: number[]) => [...text(t), d.length & 255, (d.length >> 8) & 255, 0, 0, ...d, ...(d.length & 1 ? [0] : [])];
  const body = [...text("WEBP"), ...ch("VP8X", [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...ch("VP8 ", [9, 9, 9, 9]), ...ch("EXIF", text("GPS Cairo")), ...ch("XMP ", text("<x>me</x>"))];
  const n = body.length;
  const src = Uint8Array.from([...text("RIFF"), n & 255, (n >> 8) & 255, 0, 0, ...body, ...text("TRAILER")]);
  const r = stripImageMetadata(src, "image/webp");
  assert.ok(r);
  for (const s of ["GPS", "Cairo", "<x>", "TRAILER"]) assert.ok(!has(r.bytes, s), s);
  assert.equal(r.bytes[20] & 0x0c, 0, "EXIF/XMP flags cleared");
  const size = r.bytes[4] + (r.bytes[5] << 8);
  assert.equal(size + 8, r.bytes.length);
});

test("every public image path strips metadata; private documents are untouched", () => {
  const src = readFileSync(new URL("./upload-server.ts", import.meta.url), "utf8");
  assert.match(src, /if \(kind === "avatar"\) \{\s+const stripped = stripImageMetadata/);
  assert.match(src, /if \(!stripped\) return \{ ok: false/);
  assert.match(src, /\.upload\(path, body,/);
  // The public copy of a verification profile photo goes through the same avatar path.
  assert.match(readFileSync(new URL("./verification/carry-over.ts", import.meta.url), "utf8"), /storeUpload\("avatar", userId/);
  // The private verification documents path does not alter evidence.
  assert.doesNotMatch(readFileSync(new URL("./verification/documents-server.ts", import.meta.url), "utf8"), /stripImageMetadata/);
});
