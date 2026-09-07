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

const fixtures = readdirSync('fixtures', { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

const pkg = arg('--package')
const specs = pkg
  ? [`${pkg}@${arg('--version') || 'latest'}`]
  : Object.keys(JSON.parse(readFileSync('support.json', 'utf8')).libraries)
      .map((name) => `${name}@latest`)
      .sort()

const out = { fixtures: JSON.stringify(fixtures), specs: JSON.stringify(specs) }
console.log(JSON.stringify(out, null, 2))

if (process.env.GITHUB_OUTPUT) {
  for (const [k, v] of Object.entries(out)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
  }
}
