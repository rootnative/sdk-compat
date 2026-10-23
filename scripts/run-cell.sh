#!/usr/bin/env bash
# Run one matrix cell locally, in the same order compat.yml runs it.
#
# Usage: scripts/run-cell.sh <fixture> <spec-or-tarball> [tarball...]
#   scripts/run-cell.sh sdk-57 @rootnative/inertia@0.0.12
#   scripts/run-cell.sh sdk-57 ../inertia/packages/core/rootnative-inertia-0.0.10.tgz
#   scripts/run-cell.sh sdk-58 ../ui/pack/rootnative-components-0.0.0-alpha.28.tgz \
#     ../ui/pack/rootnative-core-0.0.0-alpha.28.tgz
#
# Each extra tarball is a package that releases with the candidate. It is
# installed beside the candidate, as the CI gate installs every tarball of its
# artifact, so that peer does not come from the registry.
#
# The fixture's package.json and yarn.lock are restored afterwards, because a
# fixture pins the SDK runtime only and must never record the candidate.
set -euo pipefail

USAGE="usage: run-cell.sh <fixture> <spec-or-tarball> [tarball...]"
FIXTURE="${1:?$USAGE}"
SPEC="${2:?$USAGE}"
shift 2
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/fixtures/$FIXTURE"

[ -d "$DIR" ] || { echo "no such fixture: $FIXTURE"; exit 1; }

file_target() {
  echo "file:$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
}

SIBLINGS=()
for FILE in "$@"; do
  case "$FILE" in
    *.tgz) [ -f "$FILE" ] || { echo "no such tarball: $FILE"; exit 1; } ;;
    *) echo "not a tarball: $FILE"; exit 1 ;;
  esac
  SIBLINGS+=("$(file_target "$FILE")")
done

cleanup() {
  git -C "$ROOT" checkout -- "fixtures/$FIXTURE/package.json" \
    "fixtures/$FIXTURE/yarn.lock" "fixtures/$FIXTURE/candidate.ts" 2>/dev/null || true
  rm -rf "$DIR/dist" "$DIR/dist-web"
}
trap cleanup EXIT

case "$SPEC" in
  *.tgz)
    TARGET="$(file_target "$SPEC")"
    PKG="$(tar -xzOf "$SPEC" package/package.json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).name')"
    ;;
  *)
    TARGET="$SPEC"
    # Strip the version, keeping the scope: @scope/name@1.2.3 -> @scope/name.
    # node rather than sed: BSD and GNU sed disagree on branch syntax, and this
    # script has to run on a macOS laptop as well as an ubuntu runner.
    PKG="$(node -pe 'const s=process.argv[1]; const i=s.lastIndexOf("@"); i>0?s.slice(0,i):s' "$SPEC")"
    ;;
esac

# In CI, `range` and `cell` are separate jobs with fail-fast disabled, so a
# bad declared range never hides a tree result. Mirror that here: record the
# failure, keep going, and fail at the end.
STATUS=0
echo "==> range"
node "$ROOT/scripts/check-range.mjs" "$SPEC" || STATUS=1

echo "==> install runtime"
(cd "$DIR" && yarn install --frozen-lockfile >/dev/null)

# The guarded expansion: bash 3.2 on macOS fails on an empty array with -u.
echo "==> install candidate: $TARGET ${SIBLINGS[*]+${SIBLINGS[*]}}"
(cd "$DIR" && yarn add "$TARGET" ${SIBLINGS[@]+"${SIBLINGS[@]}"} >/dev/null)

# yarn classic does not install peers; a real consumer has them.
echo "==> install candidate peers"
node "$ROOT/scripts/install-peers.mjs" "$FIXTURE"

echo "==> point the fixture entry at $PKG"
node "$ROOT/scripts/set-candidate.mjs" "$FIXTURE" "$PKG"

echo "==> peers"
node "$ROOT/scripts/check-peers.mjs" "fixtures/$FIXTURE"

bundle() {
  local script="$1" label="$2" log
  log="$(mktemp)"
  echo "==> $label"
  if (cd "$DIR" && yarn "$script") >"$log" 2>&1; then
    grep -E "Bundled" "$log" || true
  else
    # Metro reports a failed resolution over many lines. An earlier version
    # piped this through grep and printed nothing at all when it failed.
    echo "--- $label FAILED ---"
    grep -vE "^warning|^\$ |^yarn run|^error Command failed" "$log" | tail -25
    rm -f "$log"
    return 1
  fi
  rm -f "$log"
}

bundle bundle "bundle native (src path)"
bundle bundle:web "bundle web (dist path)"

if [ "$STATUS" -ne 0 ]; then
  echo "==> tree assertions passed, but the declared range over-promises"
  exit 1
fi
echo "==> cell OK: $FIXTURE / $SPEC"
