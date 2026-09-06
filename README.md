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

    fixtures/sdk-54/       Expo 54 · RN 0.81 · Reanimated 4.1 · worklets 0.5
    fixtures/sdk-57/       Expo 57 · RN 0.86 · Reanimated 4.5 · worklets 0.10
    scripts/check-peers.mjs
    peer-exceptions.json

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

**A pinned fixture cannot catch a bad peer *range*.** Every fixture pins one
internally consistent SDK, so an open-ended range like
`react-native-reanimated >=4.0.0` is satisfied by it and the cell goes green.
The published `ERESOLVE` bug only appears when a consumer pins an old runtime
and lets the other peers float to their newest match. That needs a different
cell shape, not another SDK.

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

`@rootnative/inertia@0.0.10`:

| Fixture | check:peers | bundle              |
| ------- | ----------- | ------------------- |
| sdk-54  | pass        | pass · 944 modules  |
| sdk-57  | pass (1 suppressed) | pass · 996 modules |

So 0.0.10 works on both ends of the current SDK range, three majors apart, with
no source change. Its peer ranges do not lie about SDK 57.

## Status

Step 2 of 6. Remaining: a floating-range cell (see the range decision above),
the support-policy file, the built-output assertion, and the reusable workflow.
