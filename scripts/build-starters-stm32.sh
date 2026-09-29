#!/usr/bin/env bash
# Builds every STM32 HAL starter project that scripts/gen-starters.mjs --toolchain stm32-hal wrote
# into <dir> (<dir>/<board>/<template>/) with arm-none-eabi-gcc. Used by the nightly firmware job.
#
#   bash scripts/build-starters-stm32.sh <dir>
#
# ST's repositories are cloned once, at the tags the projects pin in their CMakeLists.txt, and
# handed to every project through CMake's FETCHCONTENT_SOURCE_DIR_<NAME> (the same files the
# projects would download themselves). A project fails when CMake or the compiler fails, when
# main.c or syscalls.c has a warning (-Wall -Wextra), or when no .bin file comes out.
set -u

dir="${1:?usage: build-starters-stm32.sh <dir>}"
cache="${STM32_REPO_CACHE:-$dir/.st-repos}"
failed=()
built=0

first=$(ls "$dir"/*/*/CMakeLists.txt 2>/dev/null | head -n 1)
[ -n "$first" ] || { echo "::error::no projects found in $dir"; exit 1; }
defs=()
# FetchContent_Declare(<name> GIT_REPOSITORY <url> GIT_TAG <tag> GIT_SHALLOW TRUE)
while read -r name url tag; do
  if [ ! -d "$cache/$name" ]; then
    git clone --quiet --depth 1 --branch "$tag" "$url" "$cache/$name" || { echo "::error::could not clone $url $tag"; exit 1; }
  fi
  defs+=("-DFETCHCONTENT_SOURCE_DIR_$(echo "$name" | tr '[:lower:]' '[:upper:]')=$cache/$name")
  echo "$name $tag"
done < <(sed -n 's/^ *FetchContent_Declare(\([a-z0-9_]*\) GIT_REPOSITORY \([^ ]*\) GIT_TAG \([^ ]*\) .*/\1 \2 \3/p' "$first")

for project in "$dir"/*/*/; do
  project="${project%/}"
  name="${project#"$dir"/}"
  echo "::group::$name"
  log="$project/build.log"
  # CFLAGS adds the extra warnings on top of the project's own -Wall.
  if CFLAGS="-Wall -Wextra" cmake -S "$project" -B "$project/build" -G Ninja "${defs[@]}" >"$log" 2>&1 &&
    cmake --build "$project/build" >>"$log" 2>&1; then
    if grep -qE "(main|syscalls)\.c:[0-9]+:[0-9]+: warning" "$log"; then
      grep -E "(main|syscalls)\.c:[0-9]+:[0-9]+: warning" "$log"
      failed+=("$name (warnings in main.c or syscalls.c)")
    elif [ ! -f "$project/build/boardpilot_starter.bin" ]; then
      failed+=("$name (no .bin file)")
    else
      built=$((built + 1))
      grep -A3 "Memory region" "$log" | sed 's/^/  /'
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
