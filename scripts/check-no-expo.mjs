#!/usr/bin/env node
/**
 * Assert that a fixture with no Expo has no Expo runtime in its tree.
 *
 * install-peers.mjs adds each required peer that is absent. When a library
 * asks for an Expo package, the runner installs it into a React Native CLI
 * fixture, and the bundle can still pass. The fixture is then not an app
 * without Expo any more, and nothing says so. This check fails instead.
 *
 * It looks for `expo` and `expo-modules-core`. Every Expo Module runs on
 * `expo-modules-core`, so that name catches an `expo-*` package that does not
 * bring `expo` with it.
 *
 * A fixture is an Expo app when its `app.json` has an `expo` key, and the
 * check skips it. The rule can't read `package.json`: `yarn add` writes each
 * peer that install-peers adds into it, `expo` too.
 *
 * Usage: node scripts/check-no-expo.mjs <fixture-dir>
 * Exit 0 when the fixture is an Expo app or its tree has no Expo runtime,
 * 1 otherwise.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const RUNTIME = ['expo', 'expo-modules-core']

const FIELDS = {
  dependencies: 'dependency',
  peerDependencies: 'peer',
  optionalDependencies: 'optional dependency',
}

const fixtureDir = resolve(process.argv[2] ?? '.')
const rootModules = join(fixtureDir, 'node_modules')

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

if (!existsSync(rootModules)) {
  console.error(
    `[check-no-expo] no node_modules in ${fixtureDir} — install first`,
  )
  process.exit(1)
}

if (readJson(join(fixtureDir, 'app.json'))?.expo) {
  console.log(`[check-no-expo] skip — ${fixtureDir} is an Expo app`)
  process.exit(0)
}

/** Every installed package directory, nested and scoped ones included. */
const packageDirs = (modules) => {
  if (!existsSync(modules)) return []
  const out = []
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || !entry.isDirectory()) continue
    const full = join(modules, entry.name)
    const dirs = entry.name.startsWith('@')
      ? readdirSync(full, { withFileTypes: true })
          .filter((e) => !e.name.startsWith('.') && e.isDirectory())
          .map((e) => join(full, e.name))
      : [full]
    for (const dir of dirs) {
      out.push(dir, ...packageDirs(join(dir, 'node_modules')))
    }
  }
  return out
}

const installed = packageDirs(rootModules)
  .map((dir) => ({ dir, pkg: readJson(join(dir, 'package.json')) }))
  .filter(({ pkg }) => pkg?.name)

const found = installed.filter(({ pkg }) => RUNTIME.includes(pkg.name))

if (found.length === 0) {
  console.log(`[check-no-expo] OK — no Expo runtime in ${fixtureDir}`)
  process.exit(0)
}

// `expo`, `expo-*`, `@expo/*` and `babel-preset-expo`.
const isExpoPackage = (name) => /(^|[@/-])expo($|[/-])/.test(name)

const askersOf = (name) =>
  installed.flatMap(({ pkg }) =>
    Object.entries(FIELDS)
      .filter(([field]) => pkg[field]?.[name])
      .map(([, label]) => ({
        name: pkg.name,
        text: `${pkg.name}@${pkg.version} (${label})`,
      })),
  )

// Expo's own packages ask for its runtime too, and a list of them hides the
// package that brought Expo in. So show the askers from outside Expo first.
const describeAskers = (askers) => {
  if (askers.length === 0) return 'no installed package'
  const outside = askers.filter((a) => !isExpoPackage(a.name))
  const shown = outside.length ? outside : askers
  const rest = askers.length - shown.length
  return [
    ...shown.map((a) => a.text),
    ...(rest ? [`and ${rest} Expo package(s)`] : []),
  ].join(', ')
}

console.error(
  `[check-no-expo] ${fixtureDir} isn't an Expo app, but its tree has the Expo runtime:\n`,
)
for (const { dir, pkg } of found) {
  console.error(`  ${pkg.name}@${pkg.version} in ${relative(fixtureDir, dir)}`)
  console.error(`    asked for by: ${describeAskers(askersOf(pkg.name))}`)
}
console.error(
  '\nA library that needs the Expo runtime does not support an app without Expo.',
)
process.exit(1)
