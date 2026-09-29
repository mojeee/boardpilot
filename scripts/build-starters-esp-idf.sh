#!/usr/bin/env bash
# Builds every ESP-IDF starter project that scripts/gen-starters.mjs --toolchain esp-idf wrote into
# <dir> (<dir>/<board>/<template>/) with the real ESP-IDF. Used by the nightly firmware job, inside
# Espressif's espressif/idf container (IDF_PATH set, idf.py on the PATH).
#
#   . $IDF_PATH/export.sh && bash scripts/build-starters-esp-idf.sh <dir>
#
# Each project's IDF target comes from its sdkconfig.defaults (CONFIG_IDF_TARGET). A project fails
# when idf.py fails, when main.c has a compiler warning, or when no .bin file comes out.
set -u

dir="${1:?usage: build-starters-esp-idf.sh <dir>}"
command -v idf.py >/dev/null || { echo "::error::idf.py not found: run . \$IDF_PATH/export.sh first"; exit 1; }
failed=()
built=0

for project in "$dir"/*/*/; do
  project="${project%/}"
  name="${project#"$dir"/}"
  echo "::group::$name"
  log="$project/build.log"
  if idf.py -C "$project" -B "$project/build" build >"$log" 2>&1; then
    if grep -q "main/main\.c:[0-9]*:[0-9]*: warning" "$log"; then
      grep "main/main\.c:[0-9]*:[0-9]*: warning" "$log"
      failed+=("$name (warnings in main.c)")
    elif [ ! -f "$project/build/boardpilot_starter.bin" ]; then
      failed+=("$name (no .bin file)")
    else
      built=$((built + 1))
      echo "built $name"
    fi
  else
    tail -n 40 "$log"
    failed+=("$name")
  fi
  echo "::endgroup::"
done

echo "$built projects built."
if [ "${#failed[@]}" -gt 0 ]; then
  printf '::error::failed: %s\n' "${failed[@]}"
  exit 1
fi
if [ "$built" -eq 0 ]; then
  echo "::error::no projects found in $dir"
  exit 1
fi
