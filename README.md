# sdk-compat

Compatibility matrix for the `@rootnative/*` libraries.

It answers one question: **which Expo SDKs and which React Native CLI versions
does a given release actually work on?** Each fixture is a minimal app pinned to
one runtime: an Expo app for each Expo SDK, and a React Native CLI app with no
Expo for each React Native band. CI installs a candidate build of a library into
every fixture, checks the resulting tree, and bundles it. A cell that fails is a
runtime the library does not support, whatever its peer range claims.

## Why this is a separate repository

`inertia` and `ui` both need the matrix, so keeping it here means one
implementation instead of two. The fixtures also have to stay isolated from each
other — every fixture owns its lockfile and resolves its own runtime.

## Layout

    .github/workflows/compat.yml
    fixtures/sdk-57/         Expo 57 · RN 0.86 · Reanimated 4.5 · worklets 0.10
    fixtures/sdk-58/         Expo 58 · RN 0.88 · Reanimated 4.7 · worklets 0.13
    fixtures/rn-cli-0.88/    RN CLI 20.2 · RN 0.88 · Reanimated 4.7 · worklets 0.13, no Expo
    scripts/check-peers.mjs  is the installed tree valid?
    scripts/check-no-expo.mjs  does a fixture with no Expo stay without it?
    scripts/check-range.mjs  does the declared range promise the impossible?
    scripts/matrix.mjs       fixtures x specs, for CI
    scripts/run-cell.sh      run one cell locally, same order as CI
    peer-exceptions.json     suppressions, each with its evidence
    support.json             what the matrix has actually proven

## Running one cell

    yarn install                                  # once, at the repo root
    cd fixtures/sdk-57
    yarn install --frozen-lockfile                # the pinned SDK runtime
    yarn add @rootnative/inertia@0.0.12           # the candidate
    cd ../.. && yarn check:peers fixtures/sdk-57  # assertion 1
    yarn check:no-expo fixtures/sdk-57            # assertion 2, skips an Expo app
    cd fixtures/sdk-57 && yarn bundle             # assertion 3

A fixture pins the **runtime** (an Expo SDK, or a React Native version) and
nothing else. The library under test is
never a fixture dependency — the runner installs it on top, so one fixture
serves every library and every candidate version. `yarn add` writes the
candidate into `package.json` and `yarn.lock`; that is fine in an ephemeral CI
checkout, but those two files must stay runtime-only in git.

## CI

`compat.yml` is a reusable workflow with three ways in.

**`workflow_call`** — `inertia` and `ui` call it from their own CI, so the
matrix is implemented once. Passing `tarball-artifact` makes it a gate that runs
*before* publishing:

```yaml
jobs:
  pack:
    runs-on: ubuntu-latest
    steps:
      # ... build, then `npm pack` into ./pack
      - uses: actions/upload-artifact@<sha>
        with:
          name: candidate
          path: pack/*.tgz

  compat:
    needs: pack
    uses: rootnative/sdk-compat/.github/workflows/compat.yml@main
    with:
      package: "@rootnative/inertia"
      tarball-artifact: candidate
```

The artifact can hold more than one tarball. The cell installs all of them,
and the range audit reads the one of `package`. Put the packages that release
together in one artifact: `ui` packs `core` beside `components`. Without it,
`install-peers` takes `core` from the registry, where the last release can
declare the previous SDK band.

**`schedule`** — Mondays 06:00 UTC, and the reason this repository exists.
Nothing in our repositories changes, yet the answer does. It resolves fresh,
with fixture lockfiles deleted, across every library in `support.json`.

**`workflow_dispatch`** — one package, by hand.

Jobs: `prepare` builds the matrix from the cells each library claims in
`support.json`, so adding a fixture needs no workflow edit — add the directory
and claim it. `range` audits the declared range once per package; `cell` runs
the four tree assertions per fixture, with `fail-fast: false` because the shape
of the failure across fixtures is the result.

A library that claims no `fixtures` is an error, not a fallback to every
directory on disk. The fallback used to re-run an SDK a library had dropped and
report that documented boundary as a red build — the opposite of what the
`fixtures` list is for. Claiming a fixture that has no directory is an error
too, because it would silently shrink the matrix and read as a pass.

## Decisions

**Yarn installs, but yarn does not get to decide whether a tree is valid.**
Yarn classic reports peer conflicts as warnings and exits 0. Given react-native
0.81.5 and `react-native-reanimated@>=4.0.0` it installs Reanimated 4.6.0 —
which requires react-native 0.83 - 0.87 — prints

    warning " > react-native-reanimated@4.6.0" has incorrect peer dependency "react-native@0.83 - 0.87".

buried in unrelated `@babel/core` noise, and exits **0**. npm rejects the same
tree outright with `ERESOLVE`. So a green `yarn install` proves nothing, and
`scripts/check-peers.mjs` makes the assertion instead: it reads the installed
tree and validates every peer range directly. That is ground truth, it is
installer-agnostic, and it reports which package wanted what instead of an
opaque resolver dump.

**A suppressed peer stays visible.** `peer-exceptions.json` holds unmet peers
that are known not to break a cell, and every entry must carry the evidence that
justified it. Suppressed peers are printed on each run rather than hidden, so a
stale exception cannot rot unnoticed. The first entry is
`react-native-worklets` -> `@react-native/metro-config`: worklets 0.10.1 added
that peer without marking it optional, and Expo apps use `@expo/metro-config`
instead, so it is legitimately absent. SDK 57 (worklets 0.10.1) and SDK 58
(worklets 0.13.0) both bundle green without it.

**A pinned fixture cannot catch a bad peer *range*, so `check:range` does it
statically.** Every fixture pins one internally consistent SDK, so an
open-ended range like `react-native-reanimated >=4.0.0` is satisfied by it and
the cell goes green. The published `ERESOLVE` bug only appears when a consumer
pins an old runtime and lets the other peers float to their newest match.

That needs no install to detect. For each peer we declare, take the newest
version our own range admits, read *its* peers, and compare them against what we
declare for the same package. Where it is stricter than we are, we over-promise.
`newestSatisfying` caps at the `latest` dist-tag on purpose: npm carries
untagged placeholders — `react-native@1000.0.0` is real and satisfies
`>=0.81.0` — which would otherwise dominate every comparison.

**Two bundle assertions, because one export never touches `dist`.** Metro
follows the `react-native` export condition, and `inertia` points that at
`src`. A native bundle therefore compiles 58 files from `src/` and zero from
`dist/`. The web export takes the `import` condition instead and pulls 12
`dist/` chunks with zero `src/`. Only both together cover what ships.

**The lockfile is committed, and the drift run ignores it.**
`--frozen-lockfile` gives the PR gate a reproducible runtime, which is what you
want when testing your own change. But a frozen runtime can never observe the
ecosystem moving under you — and that is the failure that started this work,
when Reanimated narrowed its own peer range with no change on our side.

| Trigger      | Install                          | Catches                    |
| ------------ | -------------------------------- | -------------------------- |
| PR / release | `yarn install --frozen-lockfile` | our change breaking an SDK |
| Weekly       | `yarn install` (lockfile deleted)| upstream drift breaking us |

**`--no-bytecode` when bundling.** The assertion is that Metro resolves and
transforms the library. Hermes bytecode compilation tests Hermes instead, and
`hermesc` was observed hanging at 0% CPU for 19 minutes on macOS. Skipping it
also cuts the cell from minutes to about 25 seconds.

**`babel-preset-expo` needs an explicit devDependency.** It arrives nested under
`expo/node_modules`, but Babel resolves presets from the project root, so the
bundle fails with `Cannot find module 'babel-preset-expo'` without the pin.

**Each package picks its own resolution path, and that is the point.** Metro
follows the `react-native` export condition of the package under test:

| Package                  | Resolves to      |
| ------------------------ | ---------------- |
| `@rootnative/inertia`    | `src/index.ts`   |
| `@rootnative/components` | `dist/index.js`  |
| `@rootnative/core`       | `dist/index.mjs` |

So a fixture needs no per-library configuration, but a green `inertia` cell says
nothing about `dist` — `inertia` never loads it on native, and `dist` is exactly
where the alpha.10 worklet crash lived. A separate assertion has to cover the
built output.

**A React Native CLI fixture, because the libraries claim that host too.** The
install docs of `ui` and `inertia` tell an app with no Expo how to set up Babel,
and until 2026-11-26 no run checked that claim. `rn-cli-0.88` is the
`@react-native-community/template` 0.88.1 app, cut down to its runtime: React
Native 0.88.1, React 19.3.0 and CLI 20.2.0, plus the Reanimated and worklets
pins of `sdk-58`. So Expo is the one difference between the two cells. The
fixture has no `android/` and no `ios/` folder: `react-native bundle` needs
neither, and it doesn't run Hermes. Its Babel config adds
`react-native-worklets/plugin` by hand, as the docs tell a CLI app to do.

**A CLI fixture has no web bundle.** A CLI app has no web target. Its web path
is Vite with `@rootnative/web` or react-native-web, which is a different host
and needs a fixture of its own. The runner skips `bundle:web` when a fixture has
no such script, and the record says `n/a`. On native, `components` and `core`
resolve to `dist/` too, so the CLI cell still covers their built output. The
`dist/` of `inertia` stays covered by the web bundle of the Expo fixture.

**`check-no-expo` keeps a CLI fixture free of Expo.** `install-peers` adds each
required peer that is absent, so a library with an Expo peer gets Expo installed
into a CLI fixture. The peer check and the bundle can still pass.
`@rootnative/inertia-gradients` shows it: its `expo` peer brings `expo` and
`expo-modules-core`, and `check-peers` passes. `check-no-expo.mjs` fails when a
fixture that isn't an Expo app has `expo` or `expo-modules-core` in its tree,
and it names the package that asked for it. It reads "Expo app" from the `expo`
key in `app.json`, not from `package.json`. `yarn add` writes each added peer
into `package.json`, `expo` too, so a rule there would skip the exact case it
must catch.

**No fixture for an Expo bare app.** A bare app keeps its own `android/` and
`ios/` folders, but its JavaScript bundles through `expo export`, the same as a
managed app. The bundle of the Expo fixture covers it.

## Results

Each package passes every assertion on the fixtures it claims:

| Package                  | Fixture     | range | peers               | no-expo | bundle | bundle:web |
| ------------------------ | ----------- | ----- | ------------------- | ------- | ------ | ---------- |
| `@rootnative/inertia`    | sdk-58      | pass  | pass · 1 suppressed | n/a     | pass   | pass       |
| `@rootnative/inertia`    | rn-cli-0.88 | pass  | pass                | pass    | pass   | n/a        |
| `@rootnative/components` | sdk-58      | pass  | pass · 1 suppressed | n/a     | pass   | pass       |
| `@rootnative/components` | rn-cli-0.88 | pass  | pass                | pass    | pass   | n/a        |
| `@rootnative/core`       | sdk-58      | pass  | pass · 1 suppressed | n/a     | pass   | pass       |
| `@rootnative/core`       | rn-cli-0.88 | pass  | pass                | pass    | pass   | n/a        |
| `@rootnative/icons`      | sdk-58      | pass  | pass · 1 suppressed | n/a     | pass   | pass       |
| `@rootnative/icons`      | rn-cli-0.88 | pass  | pass                | pass    | pass   | n/a        |

All three claim `sdk-58` (2026-10-23): `inertia` from its `0.0.20` candidate,
`components` and `core` from their `0.0.0-alpha.29` candidates, built from
source and packed. All three claim `rn-cli-0.88` too (2026-11-26), from the
published `inertia` `0.0.30`, `components` `0.0.3` and `core` `0.0.3`. The
CLI cell passed again on `components` `0.0.4` and `core` `0.0.4` (2026-11-27).
`@rootnative/icons` joined the matrix that day: `0.0.4` passes both cells, and
its optional peers `lucide-react-native` and `phosphor-react-native` stay out
of the tree. The
`peers` cell of the CLI fixture suppresses nothing: the worklets peer
`@react-native/metro-config` is installed in a CLI app. `sdk-57` is the
documented boundary: `inertia` `0.0.11` to `0.0.19` and `components`
`alpha.16` to `alpha.28` were verified there. The `components` cell installs
the `core` candidate next to it, from the same artifact in CI or as an extra
tarball to `run-cell.sh`. Otherwise `install-peers` resolves `@rootnative/core`
from the registry, where the previous release still declares the old band.

**One device run backs the CLI cell.** A cell proves that Metro resolves and
transforms a package. It doesn't prove that an app starts. On 2026-11-27 an
app from `@react-native-community/template` 0.88.1, with no Expo, ran the
published `components`, `core` and `icons` `0.0.4` and `inertia` `0.0.30` as a
release build on an Android 16 emulator (x86_64). The app started with no JS
error. The theme, the MaterialDesignIcons glyphs of `mdiResolver` with no
`expo-font`, the animations, touch on `Switch`, `Chip` and `Slider`, a `Dialog`
in `PortalHost`, and the `react-native-svg` components all worked. The run had
one screen with 13 components, and no CI job repeats it.

**iOS has a workflow for the same run.** `device-ios.yml` makes the same app on
a `macos-26` runner, from `device/App.tsx`. It adds the icon font to
`Info.plist` with `rnvi-update-plist`, installs the pods, builds a Release app
for the simulator, starts it and uploads screenshots. Run it by hand; a person
reads the screenshots. Run 46019944660 (2026-11-27, iPhone 17 Pro, iOS 26.5)
passed with the same packages: the app started with no JS error, the glyphs
drew, and the indeterminate indicators moved between two frames. That run
had no touch step. The workflow now runs `device/touch.yaml` with Maestro: taps
on a switch, a chip and the dialog, and a drag on the slider. Run 46024636173
(2026-11-27) passed each step of the flow: the switch changed the state, the
drag moved the slider from 0.30 to 0.50 or more, and the dialog opened and
closed. Its last step removes the `UIAppFonts` entry from the built
app and starts it again: each icon then draws as a `?` in a box, so an iOS app
with no Expo needs the `Info.plist` step.

Getting there took two real fixes, both found by this matrix:

**`components` did not bundle at all.** It marked `@expo/vector-icons`,
`react-native-safe-area-context` and `react-native-svg` optional while importing
all three statically, so Metro failed on `Unable to resolve module` before the
declared runtime fallback could apply. The static import is deliberate — a lazy
`require` does not survive tsup `splitting: true` — so the flags were wrong, not
the imports.

**Every package over-promised its peer range** (inertia 4, components 6, core
3). They now declare the SDK 57 band. That is narrower than what they run on,
and the narrowing is forced: flat peer ranges resolve independently, so any
range admitting both SDK 54 (RN 0.81 + Reanimated 4.1) and SDK 57 (RN 0.86 +
Reanimated 4.5) also admits RN 0.81 + Reanimated 4.6, which cannot install.
Supporting two SDK bands honestly needs two release lines, not one wide range.

The `sdk-54` fixture was the documented boundary for that band: running it
against these packages reported exactly which four peers fell outside it. No
library claimed it, so CI never ran it, and it was removed on 2026-10-20 when
the `sdk-58` fixture was added. `support.json` lists the cells each library
claims, and CI runs only those.

The SDK 58 move repeated the shape, one band up. Reanimated 4.7 admits RN
0.86–0.88 on its own, but React 19.2.3 does not pair with RN 0.88 and worklets
0.10 does not pair with Reanimated 4.7, so one range for SDK 57 and SDK 58
fails `check:range`. `inertia` moved as a band, `0.0.20` on SDK 58, and SDK 57
keeps `0.0.19`.

## Status

Step 6 of 6 — the matrix is complete and both libraries are green through it.

- **A React Native CLI fixture since 2026-11-26.** `rn-cli-0.88` runs in each
  release gate of `inertia` and `ui` and in the Monday drift run. The first CI
  runs (45843127821 and 45843133890) passed for `inertia` and `components`.
  The `core` cell has run on a laptop only, until the next drift run.
- **The workflow runs on GitHub.** The first run failed because every checkout
  took the caller's repository; commit `83f8628` names `rootnative/sdk-compat`
  on each checkout. The `inertia` cells for `0.0.11` came from its candidate
  run on 2026-09-08.
- **Both repos develop against the band they declare.** `ui` moved to SDK 57
  first; `inertia` moved its dev pins, its example, and its peer ranges in
  `0.0.11` (2026-09-09) and dropped SDK 54, then moved to SDK 58 for `0.0.20`
  (2026-10-22). `game-engine` moved to SDK 57 on 2026-10-14, and it is not in
  the matrix.
- **`support.json` holds rows for `@rootnative/inertia@0.0.12` and
  `@rootnative/components@0.0.0-alpha.16`**, both from `scripts/run-cell.sh`
  runs of the published tarballs on 2026-09-21. Every `cell` job now uploads a
  `compat-result-*` artifact (`scripts/record-result.mjs`), so a green run
  leaves a row-shaped record that a human copies into the file instead of
  writing it from memory.
