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
  adb devices > "$OUT/adb-devices.txt" 2>&1 || true
  adb logcat -d -s 'ReactNativeJS:*' 'AndroidRuntime:E' > "$OUT/logcat.txt" || true
}
trap log EXIT

# A new emulator still works on its first boot for some minutes, and the
# launcher can stop responding in that time. Android then shows a "not
# responding" dialog over the app, and a flow can't find the screen under it.
# So: hide those dialogs, give the boot one minute, then wait until the load
# is low, for 5 more minutes at most.
adb shell settings put global hide_error_dialogs 1
sleep 60
for _ in $(seq 1 30); do
  LOAD="$(adb shell cat /proc/loadavg | cut -d. -f1)"
  [ "$LOAD" -lt 2 ] && break
  sleep 10
done
echo "==> emulator load: $(adb shell cat /proc/loadavg)"
# Close a dialog that came up before the setting.
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null || true

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
