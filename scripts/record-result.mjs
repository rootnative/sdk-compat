#!/usr/bin/env node
/**
 * Write one cell's result as JSON, in the shape of a `verified` entry in
 * support.json.
 *
 * Rule 4 says only a green run updates support.json, and a human writes the
 * row. Without a record the row is written from memory after the run, which is
 * how the file fell two releases behind. The `cell` job runs this with
 * `if: always()` and uploads the file, so a green run leaves evidence that is
 * copied, not recalled. A red run leaves the same file with `fail` in it.
 *
 * Usage:
 *   node scripts/record-result.mjs --fixture sdk-57 --spec @rootnative/inertia@0.0.12 \
 *     --peers success --bundle success --bundle-web failure [--tarball <artifact>] [--out results]
 *
 * The three outcome flags take a GitHub `steps.<id>.outcome` value: success,
 * failure, cancelled or skipped.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (flag) => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

const fixture = arg('--fixture')
const spec = arg('--spec')
if (!fixture || !spec) {
  console.error(
    'usage: record-result.mjs --fixture <name> --spec <pkg@version> ...',
  )
  process.exit(2)
}
const tarball = arg('--tarball') || ''
const out = arg('--out') || 'results'

const outcome = (value) =>
  ({ success: 'pass', failure: 'fail' })[value] ?? 'not run'

const installedVersion = (dir, name) => {
  const file = join(dir, 'node_modules', name, 'package.json')
  return existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8')).version
    : 'not installed'
}

// Strip the version, keeping the scope: @scope/name@1.2.3 -> @scope/name.
const at = spec.lastIndexOf('@')
const pkg = at > 0 ? spec.slice(0, at) : spec
const dir = join('fixtures', fixture)

const result = {
  recordedOn: new Date().toISOString().slice(0, 10),
  fixture,
  spec,
  candidate: {
    name: pkg,
    version: installedVersion(dir, pkg),
    from: tarball ? `artifact ${tarball}` : 'registry',
  },
  runtime: Object.fromEntries(
    [
      'expo',
      'react',
      'react-native',
      'react-native-reanimated',
      'react-native-worklets',
    ].map((name) => [name, installedVersion(dir, name)]),
  ),
  cells: {
    peers: outcome(arg('--peers')),
    bundle: outcome(arg('--bundle')),
    'bundle:web': outcome(arg('--bundle-web')),
  },
  // In a reusable workflow GITHUB_REPOSITORY is the caller, which is where the
  // run lives, so the link is right for inertia and ui as well as for a
  // scheduled run here.
  run: process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : 'local',
}

mkdirSync(out, { recursive: true })
const file = join(
  out,
  `${fixture}--${pkg.replace(/[@/]/g, '_')}--${result.candidate.version}.json`,
)
writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
console.log(`[record-result] ${file}`)
console.log(JSON.stringify(result, null, 2))
