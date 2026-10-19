# sdk-compat

Compatibility matrix for the `@rootnative/*` libraries.

It answers one question: **which Expo SDK versions does a given release actually
work on?** Each fixture is a minimal Expo app pinned to one SDK. CI installs a
candidate build of a library into every fixture, checks the resulting tree, and
bundles it. A cell that fails is an SDK the library does not support, whatever
its peer range claims.

## Why this is a separate repository

`inertia` and `ui` both need the matrix, so keeping it here means one
implementation instead of two. The fixtures also have to stay isolated from each
other — every fixture owns its lockfile and resolves its own runtime.

## Layout

    .github/workflows/compat.yml
    fixtures/sdk-54/         Expo 54 · RN 0.81 · Reanimated 4.1 · worklets 0.5
    fixtures/sdk-57/         Expo 57 · RN 0.86 · Reanimated 4.5 · worklets 0.10
    fixtures/sdk-58/         Expo 58 · RN 0.88 · Reanimated 4.7 · worklets 0.13
    scripts/check-peers.mjs  is the installed tree valid?
    scripts/check-range.mjs  does the declared range promise the impossible?
    scripts/matrix.mjs       fixtures x specs, for CI
    scripts/run-cell.sh      run one cell locally, same order as CI
    peer-exceptions.json     suppressions, each with its evidence
    support.json             what the matrix has actually proven

## Running one cell

    yarn install                                  # once, at the repo root
    cd fixtures/sdk-54
    yarn install --frozen-lockfile                # the pinned SDK runtime
    yarn add @rootnative/inertia@0.0.10           # the candidate
    cd ../.. && yarn check:peers fixtures/sdk-54  # assertion 1
    cd fixtures/sdk-54 && yarn bundle             # assertion 2

A fixture pins the **SDK runtime** and nothing else. The library under test is
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

**`schedule`** — Mondays 06:00 UTC, and the reason this repository exists.
Nothing in our repositories changes, yet the answer does. It resolves fresh,
with fixture lockfiles deleted, across every library in `support.json`.

**`workflow_dispatch`** — one package, by hand.

Jobs: `prepare` builds the matrix from the cells each library claims in
`support.json`, so adding an SDK needs no workflow edit — add the directory and
claim it. `range` audits the declared range once per package; `cell` runs the
three tree assertions per fixture, with `fail-fast: false` because the shape of
the failure across SDKs is the result.

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
instead, so it is legitimately absent and SDK 57 bundles green without it.

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

## Results

Both libraries pass every assertion on their declared band, built from source
and packed:

| Package                  | Fixture | range | peers               | bundle | bundle:web |
| ------------------------ | ------- | ----- | ------------------- | ------ | ---------- |
| `@rootnative/inertia`    | sdk-57  | pass  | pass · 1 suppressed | pass   | pass       |
| `@rootnative/components` | sdk-57  | pass  | pass · 1 suppressed | pass   | pass       |

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

The `sdk-54` fixture stays in the repository. It is now a documented boundary:
running it against these packages reports exactly which four peers fall outside
the band. `support.json` lists the cells each library claims, and CI runs only
those.

## Status

Step 6 of 6 — the matrix is complete and both libraries are green through it.

- **The workflow runs on GitHub.** The first run failed because every checkout
  took the caller's repository; commit `83f8628` names `rootnative/sdk-compat`
  on each checkout. The `inertia` cells for `0.0.11` came from its candidate
  run on 2026-09-08.
- **Both repos develop against the SDK 57 band they declare.** `ui` moved first;
  `inertia` moved its dev pins, its example, and its peer ranges in `0.0.11`
  (2026-09-09) and dropped SDK 54. `game-engine` is the one library still on
  SDK 54, and it is not in the matrix.
- **`support.json` holds rows for `@rootnative/inertia@0.0.12` and
  `@rootnative/components@0.0.0-alpha.16`**, both from `scripts/run-cell.sh`
  runs of the published tarballs on 2026-09-21. Every `cell` job now uploads a
  `compat-result-*` artifact (`scripts/record-result.mjs`), so a green run
  leaves a row-shaped record that a human copies into the file instead of
  writing it from memory.
