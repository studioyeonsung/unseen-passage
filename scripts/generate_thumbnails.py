#!/usr/bin/env python3
"""Generate JPEG thumbnails for assets/photos (skips existing up-to-date thumbs)."""
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PHOTOS_DIR = ROOT / "assets" / "photos"
THUMBS_DIR = PHOTOS_DIR / "thumbs"
MAX_WIDTH = 800
JPEG_QUALITY = 82
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".webp"}


def thumb_path(source: Path) -> Path:
    return THUMBS_DIR / f"{source.stem}.jpg"


def make_thumbnail(source: Path, destination: Path) -> int:
    image = ImageOps.exif_transpose(Image.open(source))
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    width, height = image.size
    if width > MAX_WIDTH:
        height = max(1, round(height * MAX_WIDTH / width))
        width = MAX_WIDTH
        image = image.resize((width, height), Image.Resampling.LANCZOS)

    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    image.save(destination, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return destination.stat().st_size


def main():
    sources = sorted(
        p
        for p in PHOTOS_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )

    created = updated = skipped = failed = 0
    for source in sources:
        destination = thumb_path(source)
        try:
            if destination.exists() and destination.stat().st_mtime >= source.stat().st_mtime:
                skipped += 1
                continue

            existed = destination.exists()
            make_thumbnail(source, destination)
            if existed:
                updated += 1
            else:
                created += 1
        except Exception as error:
            failed += 1
            print(f"FAIL {source.name}: {error}")

    total_bytes = sum(p.stat().st_size for p in THUMBS_DIR.glob("*.jpg"))
    print(f"sources: {len(sources)}")
    print(f"created: {created}, updated: {updated}, skipped: {skipped}, failed: {failed}")
    print(f"thumbs total: {len(list(THUMBS_DIR.glob('*.jpg')))} files, {total_bytes / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
