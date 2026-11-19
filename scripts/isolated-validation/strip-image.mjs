// Helper for exif-strip-check.py: strip one file with the app's own code.
//   node --experimental-strip-types scripts/isolated-validation/strip-image.mjs <in> <out> <mime>
import { readFileSync, writeFileSync } from "node:fs";
import { stripImageMetadata } from "../../src/lib/image-metadata.ts";
const [, , input, output, mime] = process.argv;
const r = stripImageMetadata(new Uint8Array(readFileSync(input)), mime);
if (!r) { console.error("refused"); process.exit(2); }
writeFileSync(output, r.bytes);
console.log(JSON.stringify({ removed: r.removed, orientation: r.orientation }));
