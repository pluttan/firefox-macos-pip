#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_SVG="$ROOT_DIR/../extension/icons/icon.svg"
BUILD_DIR="$ROOT_DIR/build"
ICONSET_DIR="$BUILD_DIR/icon.iconset"
OUTPUT_ICNS="$BUILD_DIR/icon.icns"

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

MASTER_PNG="$BUILD_DIR/icon-1024.png"
rm -f "$MASTER_PNG" "$BUILD_DIR/icon.svg.png"

if command -v qlmanage >/dev/null 2>&1; then
  qlmanage -t -s 1024 -o "$BUILD_DIR" "$SOURCE_SVG" >/dev/null 2>&1
  mv "$BUILD_DIR/icon.svg.png" "$MASTER_PNG"
elif command -v magick >/dev/null 2>&1; then
  magick "$SOURCE_SVG" -resize 1024x1024 "$MASTER_PNG"
else
  echo "qlmanage or ImageMagick is required to build the macOS icon." >&2
  exit 1
fi

sips -z 16 16 "$MASTER_PNG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$MASTER_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$MASTER_PNG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$MASTER_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$MASTER_PNG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$MASTER_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$MASTER_PNG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$MASTER_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$MASTER_PNG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$MASTER_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICNS"
rm -rf "$ICONSET_DIR"
rm -f "$MASTER_PNG"

echo "Wrote $OUTPUT_ICNS"
