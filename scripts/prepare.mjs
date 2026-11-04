#!/usr/bin/env node
// Runs after `pnpm install` on a git dependency (publish.md: "the author ships
// a prepare script — pnpm runs it after a git install"). Self-contained: no
// project references, no workspace context. Skips gracefully when the build
// toolchain is absent or the output is already present (registry installs of
// the published package already carry lib/).
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const lib = join(root, 'lib', 'index.js')

if (existsSync(lib)) {
  process.exit(0)
}

if (!existsSync(join(root, 'node_modules', 'typescript'))) {
  console.error('[dsh-deskbridge] prepare: typescript not installed and lib/ missing; ' +
    'install devDependencies or use the prebuilt tarball/npm package.')
  process.exit(1)
}

const tsc = spawnSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(root, 'tsconfig.build.json')], {
  stdio: 'inherit',
  cwd: root,
})

process.exit(tsc.status ?? 1)
