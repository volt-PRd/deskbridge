#!/usr/bin/env bash
# Test DeskBridge against the dsh 0.2.1-rc.3 line (the oldest supported line).
#
# Builds a sibling scenario tree: src/tests/configs from this repo, a package
# pinning every @deepseek-ai devDependency to 0.2.1-rc.3 (plus cordis 4.0.5,
# loader 1.0.6, schemastery 3.18.5 — the versions that line ships with; the
# tool-testkit and native-executor packages do not exist there and the harness
# adapts at runtime). Then typechecks, builds, and runs the full suite.
# Exit non-zero on any failure. Used by CI (test-dsh-021 job).
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
SCEN=${SCEN:-$(mktemp -d)/scenario-021}

mkdir -p "$SCEN/tests/integration" "$SCEN/scripts"
ln -s "$REPO/src" "$SCEN/src"
ln -s "$REPO/tests/unit" "$SCEN/tests/unit"
for f in fake-cli.mjs harness.ts pipeline.ts tools.spec.ts plugin-bust.spec.ts; do
  ln -s "$REPO/tests/integration/$f" "$SCEN/tests/integration/$f"
done
for f in tsconfig.json tsconfig.build.json vitest.config.ts; do ln -s "$REPO/$f" "$SCEN/$f"; done
ln -s "$REPO/scripts/prepare.mjs" "$SCEN/scripts/prepare.mjs"

cat > "$SCEN/package.json" <<'JSON'
{
  "name": "dsh-deskbridge-scenario-021",
  "version": "0.1.1",
  "private": true,
  "description": "DeskBridge test scenario against the dsh 0.2.1-rc.3 line",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^4.4.3" },
  "devDependencies": {
    "@deepseek-ai/cordis": "4.0.5",
    "@deepseek-ai/cordis-plugin-loader": "1.0.6",
    "@deepseek-ai/dsh-agent": "0.2.1-rc.3",
    "@deepseek-ai/dsh-computer-use": "0.2.1-rc.3",
    "@deepseek-ai/dsh-llm": "0.2.1-rc.3",
    "@deepseek-ai/dsh-session": "0.2.1-rc.3",
    "@deepseek-ai/dsh-subprocess": "0.2.1-rc.3",
    "@deepseek-ai/dsh-subprocess-local": "0.2.1-rc.3",
    "@deepseek-ai/dsh-system-prompt": "0.2.1-rc.3",
    "@deepseek-ai/dsh-tools": "0.2.1-rc.3",
    "@deepseek-ai/dsh-user-approval": "0.2.1-rc.3",
    "@deepseek-ai/dsh-util-values": "0.2.1-rc.3",
    "@deepseek-ai/schemastery": "~3.18.5",
    "@types/node": "^24.0.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.11"
  }
}
JSON

cd "$SCEN"
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm run build
pnpm test
echo "scenario-021: ALL GREEN"
