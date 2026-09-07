#!/usr/bin/env node
/**
 * Emit the CI matrix as GitHub Actions outputs.
 *
 * Two axes:
 *   fixtures — every directory under fixtures/, so adding an SDK needs no
 *              workflow edit.
 *   specs    — what to test. A caller naming a package tests exactly that one.
 *              The scheduled drift run has no caller, so it falls back to every
 *              library in support.json at its published `latest`, which is the
 *              combination a new consumer would actually resolve today.
 *
 * Usage: node scripts/matrix.mjs [--package <name>] [--version <spec>]
 */

import { appendFileSync, readdirSync, readFileSync } from 'node:fs'

const arg = (flag) => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

const support = JSON.parse(readFileSync('support.json', 'utf8'))

const allFixtures = readdirSync('fixtures', { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

const pkg = arg('--package')
const specs = pkg
  ? [`${pkg}@${arg('--version') || 'latest'}`]
  : Object.keys(support.libraries)
      .map((name) => `${name}@latest`)
      .sort()

// A library declares which cells it supports. Running one it does not claim
// would paint a documented boundary as a build failure: inertia deliberately
// dropped SDK 54 when it narrowed to the SDK 57 band, and that is a fact to
// record, not a regression to chase.
const claimed = (name) => support.libraries[name]?.fixtures
const names = specs.map((s) => {
  const i = s.lastIndexOf('@')
  return i > 0 ? s.slice(0, i) : s
})
const fixtures = names.every((n) => claimed(n))
  ? [...new Set(names.flatMap((n) => claimed(n)))].sort()
  : allFixtures

const out = { fixtures: JSON.stringify(fixtures), specs: JSON.stringify(specs) }
console.log(JSON.stringify(out, null, 2))

if (process.env.GITHUB_OUTPUT) {
  for (const [k, v] of Object.entries(out)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
  }
}
