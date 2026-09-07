#!/usr/bin/env node
/**
 * Declared-range audit for a published package.
 *
 * The fixtures answer "does this library work on SDK N?". They cannot answer
 * "does the declared peer range promise combinations that do not exist?",
 * because every fixture pins one internally consistent SDK and an open-ended
 * range is trivially satisfied by it.
 *
 * That second question is what shipped broken. `@rootnative/inertia@0.0.10`
 * declares `react-native >=0.81.0` and `react-native-reanimated >=4.0.0`.
 * Both look fine alone. Together they are not: the newest Reanimated the
 * range admits (4.6.0) itself requires `react-native 0.83 - 0.87`, so a
 * consumer on RN 0.81 — the floor we advertise — cannot install. Verified
 * against npm, which rejects that tree with ERESOLVE.
 *
 * No install is needed to see this. For each peer P the library declares,
 * take the newest P the range admits, read P's own peers, and compare them
 * against what the library declares for the same package. Where P is stricter
 * than we are, our range over-promises.
 *
 * Usage: node scripts/check-range.mjs <name>@<version> [...]
 * Exit 0 when every declared range is internally consistent, 1 otherwise.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import semver from 'semver'

const specs = process.argv.slice(2)
if (specs.length === 0) {
  console.error('usage: check-range.mjs <name>@<version> [...]')
  process.exit(1)
}

const npm = (args) => {
  try {
    const out = execFileSync('npm', [...args, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim() ? JSON.parse(out) : null
  } catch {
    return null
  }
}

/**
 * A pre-release gate has nothing published to query, so a spec may also be a
 * local `.tgz` from `npm pack` or an unpacked package directory. Peers then
 * come from the manifest on disk. Only the package under audit can be local;
 * its peers are always resolved from the registry.
 */
const isLocal = (spec) =>
  (spec.endsWith('.tgz') || spec.startsWith('.') || spec.startsWith('/')) &&
  existsSync(spec)

const localManifest = (spec) => {
  if (statSync(spec).isDirectory()) {
    return JSON.parse(readFileSync(join(spec, 'package.json'), 'utf8'))
  }
  const dir = mkdtempSync(join(tmpdir(), 'compat-'))
  execFileSync('tar', ['-xzf', spec, '-C', dir, 'package/package.json'], {
    stdio: 'ignore',
  })
  return JSON.parse(readFileSync(join(dir, 'package', 'package.json'), 'utf8'))
}

const peersOf = (spec) =>
  (isLocal(spec)
    ? localManifest(spec).peerDependencies
    : npm(['view', spec, 'peerDependencies'])) ?? {}

/**
 * Newest version of `name` that `range` admits.
 *
 * Capped at the `latest` dist-tag on purpose. npm publishes untagged
 * placeholders — `react-native@1000.0.0` is real, and satisfies `>=0.81.0` —
 * which would otherwise dominate every comparison and report noise. `latest`
 * is what a consumer resolving fresh actually receives.
 */
const newestSatisfying = (name, range) => {
  const latest = npm(['view', name, 'dist-tags'])?.latest
  const versions = (npm(['view', name, 'versions']) ?? []).filter(
    (v) => !semver.prerelease(v) && (!latest || semver.lte(v, latest)),
  )
  return semver.maxSatisfying(versions, range)
}

let failed = false

for (const spec of specs) {
  const declared = peersOf(spec)
  const label = isLocal(spec)
    ? `${localManifest(spec).name}@${localManifest(spec).version}`
    : spec
  console.log(`\n${label}${isLocal(spec) ? `  (local: ${spec})` : ''}`)

  if (Object.keys(declared).length === 0) {
    console.log('  no peerDependencies')
    continue
  }
  for (const [dep, range] of Object.entries(declared)) {
    console.log(`  declares ${dep} "${range}"`)
  }

  const problems = []

  for (const [dep, range] of Object.entries(declared)) {
    if (range === '*') continue
    const newest = newestSatisfying(dep, range)
    if (!newest) continue

    // What that newest choice demands of the other peers we also declare.
    for (const [sub, subRange] of Object.entries(peersOf(`${dep}@${newest}`))) {
      if (subRange === '*') continue
      const ours = declared[sub]
      if (!ours) continue

      // Our floor is the version we advertise as supported. If the newest
      // choice our own range admits rejects our own floor, we over-promise.
      const floor = semver.minVersion(ours)?.version
      if (floor && !semver.satisfies(floor, subRange)) {
        problems.push({ dep, depRange: range, newest, sub, subRange, ours, floor })
      }
    }
  }

  if (problems.length === 0) {
    console.log('  OK — declared ranges are internally consistent')
    continue
  }

  failed = true
  console.log(`\n  ${problems.length} over-promise(s):`)
  for (const p of problems) {
    console.log(
      `\n    ${p.sub} "${p.ours}" advertises ${p.sub} ${p.floor} as supported.\n` +
        `    But ${p.dep} "${p.depRange}" admits ${p.dep}@${p.newest}, which requires\n` +
        `    ${p.sub} "${p.subRange}" — excluding ${p.floor}.\n` +
        `    A consumer on ${p.sub} ${p.floor} cannot install ${label}.`,
    )
  }
}

process.exit(failed ? 1 : 0)
