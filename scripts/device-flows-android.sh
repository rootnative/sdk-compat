#!/usr/bin/env bash
# Install the device app on the running Android emulator and run the two
# Maestro flows. The emulator action of the Android device workflow calls it.
# It writes the log of the app when it ends, also after a failed flow.
#
# Usage: scripts/device-flows-android.sh <apk> <catalog-flow> <out-dir>
set -euo pipefail

APK="${1:?usage: device-flows-android.sh <apk> <catalog-flow> <out-dir>}"
CATALOG="${2:?}"
OUT="${3:?}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ID=com.rnclicheck

mkdir -p "$OUT"
log() {
  adb logcat -d -s 'ReactNativeJS:*' 'AndroidRuntime:E' > "$OUT/logcat.txt" || true
}
trap log EXIT

adb install -r "$APK"
cd "$OUT"

echo "==> touch flow"
maestro test -e APP_ID="$APP_ID" --debug-output "$OUT/maestro" \
  "$ROOT/device/touch.yaml"

echo "==> visit each demo screen"
maestro test -e APP_ID="$APP_ID" --debug-output "$OUT/maestro-catalog" \
  "$CATALOG"

# A crash of the app leaves a FATAL EXCEPTION line.
log
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  grep -A 12 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -40
  exit 1
fi
