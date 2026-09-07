#!/usr/bin/env bash
# Run one matrix cell locally, in the same order compat.yml runs it.
#
# Usage: scripts/run-cell.sh <fixture> <spec-or-tarball>
#   scripts/run-cell.sh sdk-54 @rootnative/inertia@0.0.10
#   scripts/run-cell.sh sdk-57 ../inertia/packages/core/rootnative-inertia-0.0.10.tgz
#
# The fixture's package.json and yarn.lock are restored afterwards, because a
# fixture pins the SDK runtime only and must never record the candidate.
set -euo pipefail

FIXTURE="${1:?usage: run-cell.sh <fixture> <spec-or-tarball>}"
SPEC="${2:?usage: run-cell.sh <fixture> <spec-or-tarball>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/fixtures/$FIXTURE"

[ -d "$DIR" ] || { echo "no such fixture: $FIXTURE"; exit 1; }

cleanup() {
  git -C "$ROOT" checkout -- "fixtures/$FIXTURE/package.json" \
    "fixtures/$FIXTURE/yarn.lock" 2>/dev/null || true
  rm -rf "$DIR/dist" "$DIR/dist-web"
}
trap cleanup EXIT

case "$SPEC" in
  *.tgz) TARGET="file:$(cd "$(dirname "$SPEC")" && pwd)/$(basename "$SPEC")" ;;
  *)     TARGET="$SPEC" ;;
esac

# In CI, `range` and `cell` are separate jobs with fail-fast disabled, so a
# bad declared range never hides a tree result. Mirror that here: record the
# failure, keep going, and fail at the end.
STATUS=0
echo "==> range"
node "$ROOT/scripts/check-range.mjs" "$SPEC" || STATUS=1

echo "==> install runtime"
(cd "$DIR" && yarn install --frozen-lockfile >/dev/null)

echo "==> install candidate: $TARGET"
(cd "$DIR" && yarn add "$TARGET" >/dev/null)

echo "==> peers"
node "$ROOT/scripts/check-peers.mjs" "fixtures/$FIXTURE"

echo "==> bundle native (src path)"
(cd "$DIR" && yarn bundle 2>&1 | grep -E "Bundled|error")

echo "==> bundle web (dist path)"
(cd "$DIR" && yarn bundle:web 2>&1 | grep -E "Bundled|error")

if [ "$STATUS" -ne 0 ]; then
  echo "==> tree assertions passed, but the declared range over-promises"
  exit 1
fi
echo "==> cell OK: $FIXTURE / $SPEC"
