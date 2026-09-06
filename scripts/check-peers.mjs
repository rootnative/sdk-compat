#!/usr/bin/env node
/**
 * Peer-dependency assertion for a fixture tree.
 *
 * The matrix's first question is "does this combination even resolve?".
 * We cannot ask the installer, because yarn classic answers it wrong:
 * given react-native 0.81.5 and `react-native-reanimated@>=4.0.0` it
 * installs Reanimated 4.6.0 — which demands react-native 0.83 - 0.87 —
 * prints the conflict as a warning, and exits 0. npm rejects the same
 * tree with ERESOLVE. Relying on the exit code would make every cell
 * green regardless of truth.
 *
 * So this reads the installed tree instead and checks it directly. That
 * is ground truth, and it works the same under yarn, npm, or pnpm.
 *
 * Usage: node scripts/check-peers.mjs <fixture-dir>
 * Exit 0 when every peer is satisfied, 1 otherwise.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const fixtureDir = resolve(process.argv[2] ?? '.')
const rootModules = join(fixtureDir, 'node_modules')

if (!existsSync(rootModules)) {
  console.error(`[check-peers] no node_modules in ${fixtureDir} — install first`)
  process.exit(1)
}

const readPkg = (dir) => {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Every installed package directory, scoped names included. */
const installedDirs = () => {
  const out = []
  for (const entry of readdirSync(rootModules, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(rootModules, entry.name)
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(full, { withFileTypes: true })) {
        if (!scoped.name.startsWith('.')) out.push(join(full, scoped.name))
      }
    } else {
      out.push(full)
    }
  }
  return out
}

/** What `consumerDir` actually resolves for `dep`: nested wins, then hoisted. */
const resolveInstalled = (consumerDir, dep) => {
  const nested = join(consumerDir, 'node_modules', dep)
  if (existsSync(join(nested, 'package.json'))) return readPkg(nested)?.version
  const hoisted = join(rootModules, dep)
  if (existsSync(join(hoisted, 'package.json'))) return readPkg(hoisted)?.version
  return undefined
}

/**
 * Known-benign unmet peers, each with the evidence that justified it. They are
 * reported as suppressed rather than hidden, so a stale exception is visible.
 */
const exceptions = (() => {
  try {
    return JSON.parse(
      readFileSync(join(repoRoot, 'peer-exceptions.json'), 'utf8'),
    ).exceptions
  } catch {
    return []
  }
})()

const isException = (name, dep) =>
  exceptions.some((e) => e.from === name && e.peer === dep)

const violations = []
const suppressed = []

for (const dir of installedDirs()) {
  const pkg = readPkg(dir)
  if (!pkg?.peerDependencies) continue
  const optional = pkg.peerDependenciesMeta ?? {}

  for (const [dep, range] of Object.entries(pkg.peerDependencies)) {
    const installed = resolveInstalled(dir, dep)

    if (installed === undefined) {
      if (optional[dep]?.optional) continue
      const record = { from: `${pkg.name}@${pkg.version}`, dep, range, got: null }
      ;(isException(pkg.name, dep) ? suppressed : violations).push(record)
      continue
    }
    // `*` and workspace protocols accept anything.
    if (range === '*' || range.startsWith('workspace:')) continue
    if (!semver.satisfies(installed, range, { includePrerelease: true })) {
      const record = { from: `${pkg.name}@${pkg.version}`, dep, range, got: installed }
      ;(isException(pkg.name, dep) ? suppressed : violations).push(record)
    }
  }
}

const reportSuppressed = () => {
  if (!suppressed.length) return
  console.log(`[check-peers] ${suppressed.length} suppressed by peer-exceptions.json:`)
  for (const s of suppressed) {
    console.log(`    ${s.from} wants ${s.dep}@"${s.range}" — ${s.got ?? 'not installed'}`)
  }
}

if (violations.length === 0) {
  reportSuppressed()
  console.log(`[check-peers] OK — every peer satisfied in ${fixtureDir}`)
  process.exit(0)
}

reportSuppressed()

const mismatched = violations.filter((v) => v.got !== null)
const missing = violations.filter((v) => v.got === null)

console.error(`[check-peers] ${violations.length} unsatisfied peer(s) in ${fixtureDir}\n`)
if (mismatched.length) {
  console.error('  Wrong version:')
  for (const v of mismatched) {
    console.error(`    ${v.from}\n      wants ${v.dep}@"${v.range}" — installed ${v.got}`)
  }
}
if (missing.length) {
  console.error(`${mismatched.length ? '\n' : ''}  Missing:`)
  for (const v of missing) {
    console.error(`    ${v.from}\n      wants ${v.dep}@"${v.range}" — not installed`)
  }
}
process.exit(1)
