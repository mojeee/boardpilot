#!/usr/bin/env bash
# Builds every Pico SDK starter project that scripts/gen-starters.mjs wrote into <dir>
# (<dir>/<board>/<template>/) with the real Pico SDK. Used by the nightly firmware job.
#
#   PICO_SDK_PATH=~/pico-sdk bash scripts/build-starters.sh <dir>
#
# A project fails when CMake or the compiler fails, when main.c has a warning (-Wall -Wextra), or
# when no .uf2 file comes out (picotool must be installed or findable, as in the nightly job).
# Also warns when our copy of pico_sdk_import.cmake differs from the SDK's own file.
set -u

dir="${1:?usage: build-starters.sh <dir>}"
: "${PICO_SDK_PATH:?set PICO_SDK_PATH to the pico-sdk folder}"
failed=()
built=0

for project in "$dir"/*/*/; do
  project="${project%/}"
  name="${project#"$dir"/}"
  echo "::group::$name"
  log="$project/build.log"
  # CFLAGS (not -DCMAKE_C_FLAGS, which would replace the SDK's -mcpu flags) adds the warnings.
  if CFLAGS="-Wall -Wextra" cmake -S "$project" -B "$project/build" -G Ninja >"$log" 2>&1 &&
    cmake --build "$project/build" >>"$log" 2>&1; then
    if grep -q "main\.c:[0-9]*:[0-9]*: warning" "$log"; then
      grep "main\.c:[0-9]*:[0-9]*: warning" "$log"
      failed+=("$name (warnings in main.c)")
    elif [ ! -f "$project/build/boardpilot_starter.uf2" ]; then
      failed+=("$name (no .uf2 file)")
    else
      built=$((built + 1))
      echo "built $name"
    fi
  else
    tail -n 40 "$log"
    failed+=("$name")
  fi
  # Our copy of pico_sdk_import.cmake is the SDK file after a short BoardPilot header.
  if ! sed '1,/^# The file below is the Pico SDK original/d' "$project/pico_sdk_import.cmake" | sed '1{/^$/d;}' |
    diff -q - "$PICO_SDK_PATH/external/pico_sdk_import.cmake" >/dev/null; then
    echo "::warning::$name: pico_sdk_import.cmake differs from the SDK's external/pico_sdk_import.cmake (update shared/starter/picoSdkImport.ts)"
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
