"""Independent check that public profile photos lose their EXIF/GPS metadata.

Writes real JPEG, PNG and WebP files with Pillow (GPS coordinates, camera
make/model, date, comments, XMP and text chunks), strips them with the app's
own code (strip-image.mjs), then reads the result back with Pillow, a
different implementation, and checks:
  - no GPS, no camera make/model, no date, no text/XMP/comment metadata;
  - the decoded pixels are identical to the original's (lossless);
  - a rotated JPEG keeps only its orientation tag.

    <python with Pillow> scripts/isolated-validation/exif-strip-check.py
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, PngImagePlugin

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HELPER = os.path.join(ROOT, "scripts", "isolated-validation", "strip-image.mjs")
SECRET = [b"Cairo", b"CameraMaker", b"PhoneModel", b"2026:01:02", b"xmpmeta", b"secret note"]
checks = 0

def ok(msg):
    global checks
    checks += 1
    print(f"ok {checks} - {msg}")

def strip(path, mime):
    out = path + ".stripped"
    res = subprocess.run(["node", "--experimental-strip-types", HELPER, path, out, mime], capture_output=True, text=True, cwd=ROOT)
    if res.returncode:
        sys.exit(f"strip failed: {res.stderr}")
    return out, json.loads(res.stdout.strip().splitlines()[-1])

def exif_for(orientation):
    ex = Image.Exif()
    ex[0x010F] = "CameraMaker"      # Make
    ex[0x0110] = "PhoneModel"       # Model
    ex[0x0132] = "2026:01:02 10:00:00"
    ex[0x0112] = orientation
    ex[0x8825] = {1: "N", 2: (30.0, 2.0, 40.0), 3: "E", 4: (31.0, 14.0, 9.0), 27: "Cairo"}  # GPS IFD
    return ex

def pixels(path):
    with Image.open(path) as im:
        im.load()
        return im.convert("RGB").tobytes()

def scan(path):
    data = open(path, "rb").read()
    return [s for s in SECRET if s in data]

tmp = tempfile.mkdtemp()
src = Image.new("RGB", (64, 48))
src.putdata([((x * 4) % 256, (y * 5) % 256, (x * y) % 256) for y in range(48) for x in range(64)])

# JPEG, rotated, with GPS, comment and XMP.
jpg = os.path.join(tmp, "p.jpg")
src.save(jpg, "JPEG", quality=95, exif=exif_for(6).tobytes(), comment=b"secret note",
         xmp=b'<x:xmpmeta xmlns:x="adobe:ns:meta/">secret note</x:xmpmeta>')
with Image.open(jpg) as im:
    assert im.getexif().get_ifd(0x8825), "fixture must carry GPS"
assert scan(jpg), "fixture must carry the metadata"
out, info = strip(jpg, "image/jpeg")
assert scan(out) == [], scan(out)
with Image.open(out) as im:
    ex = im.getexif()
    assert not ex.get_ifd(0x8825), "GPS survived"
    assert set(ex.keys()) <= {0x0112}, f"unexpected EXIF tags {list(ex.keys())}"
    assert ex.get(0x0112) == 6, "orientation lost"
    assert "comment" not in im.info and "xmp" not in im.info
assert pixels(out) == pixels(jpg), "JPEG pixels changed"
ok(f"JPEG: GPS, make, model, date, comment and XMP removed; orientation 6 kept; pixels identical ({info['removed']})")

# JPEG, upright: no EXIF block at all.
jpg1 = os.path.join(tmp, "u.jpg")
src.save(jpg1, "JPEG", quality=90, exif=exif_for(1).tobytes())
out1, _ = strip(jpg1, "image/jpeg")
with Image.open(out1) as im:
    assert len(im.getexif()) == 0
assert pixels(out1) == pixels(jpg1)
ok("JPEG upright: no EXIF left at all; pixels identical")

# PNG with text chunks and EXIF.
png = os.path.join(tmp, "p.png")
meta = PngImagePlugin.PngInfo()
meta.add_text("Comment", "secret note")
meta.add_itxt("Location", "Cairo")
src.save(png, "PNG", pnginfo=meta, exif=exif_for(1).tobytes())
assert scan(png)
outp, info = strip(png, "image/png")
assert scan(outp) == [], scan(outp)
with Image.open(outp) as im:
    im.load()
    assert not im.text and len(im.getexif()) == 0
assert pixels(outp) == pixels(png)
ok(f"PNG: text, iTXt and eXIf removed; pixels identical ({info['removed']})")

# WebP (lossless) with EXIF and XMP.
webp = os.path.join(tmp, "p.webp")
src.save(webp, "WEBP", lossless=True, exif=exif_for(1).tobytes(), xmp=b"<x:xmpmeta>secret note</x:xmpmeta>")
assert scan(webp)
outw, info = strip(webp, "image/webp")
assert scan(outw) == [], scan(outw)
with Image.open(outw) as im:
    im.load()
    assert len(im.getexif()) == 0 and "xmp" not in im.info
assert pixels(outw) == pixels(webp)
ok(f"WebP: EXIF and XMP removed, file still decodes; pixels identical ({info['removed']})")

print(f"\n{checks} checks passed")
