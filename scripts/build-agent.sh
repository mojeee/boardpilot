#!/usr/bin/env bash
# Builds the BoardPilot diagnostic agent (firmware/agent) with arduino-cli and
# copies the flashable binaries plus a manifest into resources/agent/.
# Run it with: npm run build:agent
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKETCH="$ROOT/firmware/agent"
BUILD="$SKETCH/build"
OUT="$ROOT/resources/agent"
FQBN="esp32:esp32:esp32"
ESP32_INDEX_URL="https://espressif.github.io/arduino-esp32/package_esp32_index.json"

say() { printf '%s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

if ! command -v arduino-cli >/dev/null 2>&1; then
  cat >&2 <<EOF
arduino-cli is not installed, so the agent firmware cannot be built.

Install it and the ESP32 core, then run this script again:

  brew install arduino-cli
  arduino-cli core update-index --additional-urls $ESP32_INDEX_URL
  arduino-cli core install esp32:esp32 --additional-urls $ESP32_INDEX_URL

End users do not need this: the app ships the prebuilt agent in resources/agent/.
EOF
  exit 1
fi

CORE_VERSION="$(arduino-cli core list 2>/dev/null | awk '$1 == "esp32:esp32" { print $2; exit }')"
if [ -z "$CORE_VERSION" ]; then
  cat >&2 <<EOF
The ESP32 core for arduino-cli is not installed. Install it with:

  arduino-cli core update-index --additional-urls $ESP32_INDEX_URL
  arduino-cli core install esp32:esp32 --additional-urls $ESP32_INDEX_URL
EOF
  exit 1
fi
case "$CORE_VERSION" in
  3.*) ;;
  *) say "Warning: esp32:esp32 core $CORE_VERSION found. The agent is written for core 3.x." ;;
esac

say "Building bp-agent with esp32:esp32 $CORE_VERSION ($FQBN)..."
mkdir -p "$BUILD"
arduino-cli compile --fqbn "$FQBN" --output-dir "$BUILD" "$SKETCH"

mkdir -p "$OUT"
copy_part() {
  local src="$BUILD/$1" dst="$OUT/$2"
  [ -f "$src" ] || fail "The build did not produce $1 (looked in $BUILD)."
  cp "$src" "$dst"
  say "  $2"
}
say "Copying binaries to resources/agent/:"
copy_part agent.ino.bin agent.bin
copy_part agent.ino.bootloader.bin bootloader.bin
copy_part agent.ino.partitions.bin partitions.bin

# boot_app0.bin (OTA data, flashed at 0xe000) ships with the esp32 core.
DATA_DIR="$(arduino-cli config get directories.data 2>/dev/null || true)"
BOOT_APP0=""
for dir in "$DATA_DIR" "$HOME/Library/Arduino15" "$HOME/.arduino15"; do
  [ -n "$dir" ] || continue
  candidate="$dir/packages/esp32/hardware/esp32/$CORE_VERSION/tools/partitions/boot_app0.bin"
  if [ -f "$candidate" ]; then BOOT_APP0="$candidate"; break; fi
done
if [ -z "$BOOT_APP0" ]; then
  # Fall back to any installed core version (newest last).
  for candidate in "$HOME"/Library/Arduino15/packages/esp32/hardware/esp32/*/tools/partitions/boot_app0.bin \
                   "$HOME"/.arduino15/packages/esp32/hardware/esp32/*/tools/partitions/boot_app0.bin; do
    [ -f "$candidate" ] && BOOT_APP0="$candidate"
  done
fi

HAVE_BOOT_APP0=0
if [ -n "$BOOT_APP0" ]; then
  cp "$BOOT_APP0" "$OUT/boot_app0.bin"
  HAVE_BOOT_APP0=1
  say "  boot_app0.bin (from $BOOT_APP0)"
else
  rm -f "$OUT/boot_app0.bin"
  say "Warning: boot_app0.bin was not found in the esp32 core. It is left out of the manifest."
fi

# Flash offsets for the ESP32 with the default partition table.
{
  printf '{\n'
  printf '  "name": "bp-agent",\n'
  printf '  "ver": "0.1",\n'
  printf '  "chip": "esp32",\n'
  printf '  "parts": [\n'
  printf '    { "offset": "0x1000", "file": "bootloader.bin" },\n'
  printf '    { "offset": "0x8000", "file": "partitions.bin" },\n'
  if [ "$HAVE_BOOT_APP0" = 1 ]; then
    printf '    { "offset": "0xe000", "file": "boot_app0.bin" },\n'
  fi
  printf '    { "offset": "0x10000", "file": "agent.bin" }\n'
  printf '  ]\n'
  printf '}\n'
} > "$OUT/manifest.json"
say "  manifest.json"

say "Done. The agent is ready in resources/agent/."
