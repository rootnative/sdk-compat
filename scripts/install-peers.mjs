#!/usr/bin/env node
/**
 * Install the candidate's own required peers into a fixture.
 *
 * npm 7+ installs peers automatically; yarn classic does not. Without this a
 * `@rootnative/components` cell reports `@rootnative/core`,
 * `@rootnative/inertia` and `react-native-svg` as missing — true of the
 * fixture, but not of any real consumer, who would have installed them. The
 * cell would be red for the wrong reason.
 *
 * A fixture pins the SDK runtime, so anything already installed is left alone:
 * only genuinely absent peers are added, at the newest version their range
 * admits. Resolution repeats, because an added peer brings peers of its own.
 *
 * Usage: node scripts/install-peers.mjs <fixture>
 */

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const fixture = process.argv[2]
if (!fixture) {
  console.error('usage: install-peers.mjs <fixture>')
  process.exit(1)
}
const dir = join('fixtures', fixture)

const scan = () => {
  try {
    const out = execFileSync(
      'node',
      ['scripts/check-peers.mjs', dir, '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return JSON.parse(out)
  } catch (e) {
    // Exit 1 simply means violations exist; the payload is still on stdout.
    try {
      return JSON.parse(e.stdout)
    } catch {
      return { violations: [] }
    }
  }
}

const MAX_PASSES = 4
let added = []

for (let pass = 1; pass <= MAX_PASSES; pass++) {
  const missing = scan().violations.filter((v) => v.got === null)
  if (missing.length === 0) break

  // Only add what is absent. A wrong-version violation is a real finding and
  // must not be papered over by installing a different version.
  const specs = missing.map((v) => `${v.dep}@${v.range}`)
  console.log(`[install-peers] pass ${pass}: ${specs.join(' ')}`)

  try {
    execFileSync('yarn', ['add', ...specs], { cwd: dir, stdio: 'inherit' })
  } catch {
    console.error(`[install-peers] yarn add failed for: ${specs.join(' ')}`)
    process.exit(1)
  }
  added = added.concat(specs)
}

console.log(
  added.length
    ? `[install-peers] added ${added.length}: ${added.join(' ')}`
    : '[install-peers] nothing to add',
)
