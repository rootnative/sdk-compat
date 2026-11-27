#!/usr/bin/env bash
# Make the device app: a React Native CLI app with no Expo, with the published
# packages and the demo screens of the ui example app. The iOS and the Android
# device workflows both start with this script, so they run the same app.
#
# Usage: scripts/device-app.sh <dir> [components-version] [inertia-version]
#   scripts/device-app.sh "$RUNNER_TEMP" latest latest
#
# It writes <dir>/RnCliCheck (the app), <dir>/ui (the ui checkout) and
# <dir>/catalog.yaml (the Maestro flow that visits each demo screen).
set -euo pipefail

DIR="${1:?usage: device-app.sh <dir> [components-version] [inertia-version]}"
COMPONENTS="${2:-latest}"
INERTIA="${3:-latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

APP_NAME=RnCliCheck
RN_VERSION=0.88.1
RN_CLI_VERSION=20.2.0

# The template uses Yarn 3. On CI, Yarn 3 refuses to write a lockfile, and a
# new app has none.
export YARN_ENABLE_IMMUTABLE_INSTALLS=false

mkdir -p "$DIR"
cd "$DIR"

echo "==> create the React Native CLI app"
npx --yes "@react-native-community/cli@$RN_CLI_VERSION" init "$APP_NAME" \
  --version "$RN_VERSION" --pm yarn --skip-git-init --install-pods false
cd "$APP_NAME"

# The same install that the docs give to an app with no Expo: the packages,
# the required peers and the icon font. No expo-font.
echo "==> install the packages"
yarn add \
  "@rootnative/core@$COMPONENTS" \
  "@rootnative/components@$COMPONENTS" \
  "@rootnative/icons@$COMPONENTS" \
  "@rootnative/inertia@$INERTIA" \
  react-native-reanimated@~4.7.1 \
  react-native-worklets@0.13.0 \
  react-native-svg \
  @react-native-vector-icons/material-design-icons

node -e '
  const tree = require("fs").readdirSync("node_modules")
  if (tree.includes("expo") || tree.includes("expo-modules-core")) {
    throw new Error("The app has an Expo runtime.")
  }
  console.log(require("./package.json").dependencies)
'

# The ui example app has one demo screen for each component. Take them from
# the tag of the installed version, so the screens and the packages agree.
echo "==> add the demo screens"
VERSION="$(node -p 'require("@rootnative/components/package.json").version')"
git clone --quiet --depth 1 --branch "v$VERSION" \
  https://github.com/rootnative/ui.git "$DIR/ui"
node "$ROOT/scripts/device-catalog.mjs" . "$DIR/ui" "$DIR/catalog.yaml"
