# DeskBridge

**A DeepSeek Harness plugin exposing [Vercel Labs' agent-desktop](https://github.com/vercel-labs/agent-desktop) as model-facing tools.**

DeskBridge ("desktop bridge") lets a DeepSeek Harness (DSH) agent read and operate desktop applications through the OS accessibility tree — no screenshots, no pixel matching. It wraps the `agent-desktop` CLI in one shared subprocess execution layer and registers **eleven tools** that implement the observe → act → verify loop the CLI is designed around:

| Observation (read-only) | Interaction (approval-gated) |
|---|---|
| `desktop_status` | `desktop_click` |
| `desktop_list_apps` | `desktop_type` |
| `desktop_list_windows` | `desktop_set_value` |
| `desktop_snapshot` | `desktop_press` |
| `desktop_find` | |
| `desktop_get` | |
| `desktop_screenshot` | |

## How it works

- Every CLI call is an **argv array through DSH's `ctx.subprocess` seam** — never a shell string. Values are validated (refs against the CLI's own `@<snapshot_id>:e<N>` grammar, app names, combos, text lengths) **before** any spawn, and dash-leading values are rejected so nothing can be misread as a flag.
- The CLI's JSON envelope (version 2.6) is validated with **zod**; all 16 documented error codes are typed. Domain failures (`STALE_REF`, `PERM_DENIED`, …) are returned as successful tool values carrying the upstream recovery hints — the model is told to take a fresh snapshot, never to blindly retry. Infrastructure failures (missing binary, garbage output, timeouts) are `isError` results.
- **No automatic retries anywhere.** Actions that may already have been delivered are never repeated by the plugin.
- **Mutating tools are approval-gated** through DSH's native `tools/pre-execute` → `approval` seam; with no approval channel they fail closed. An optional `allowedApps` allowlist gates app-scoped observation too.
- Screenshots are written to plugin-chosen paths (never model-chosen); the plugin never logs typed text, snapshot trees, or image bytes.
- Timeouts (outer per class, inner per command) and `exec.signal` cancellation kill the child process deterministically.
- The plugin is **off by default** (`enabled: false`) and claims the exclusive `computerUse` provider slot so two desktop drivers never share one DSH instance (configurable).

## Requirements

- DeepSeek Harness `>=0.2.2-alpha.2 <0.3.0` (installed through its official plugin mechanism)
- [agent-desktop](https://github.com/vercel-labs/agent-desktop) v1.0.x CLI: `npm install -g agent-desktop` (macOS, Windows, or Linux with AT-SPI)
- Node.js >= 24.9

## Install

See [docs/INSTALL.md](docs/INSTALL.md). The short version:

```sh
dsh plugin --profile <name> add <this-package>   # npm name, tarball, or local path
```

then enable the row (it ships disabled) and set `enabled: true` in its config. Configuration reference: [docs/CONFIGURATION.md](docs/CONFIGURATION.md). Tool reference: [docs/TOOLS.md](docs/TOOLS.md). Troubleshooting: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). Research notes on the DSH external plugin system: [research/external-plugin-system.md](research/external-plugin-system.md).

## Development

```sh
pnpm install
pnpm run build      # tsc → lib/
pnpm test           # vitest: 64 tests (unit + integration against a fake CLI)
pnpm typecheck
```

Tests use a deterministic fake CLI (`tests/integration/fake-cli.mjs`) that emits the verified envelope contract, plus the **real** dsh-tools execution pipeline (`executeToolFixture`), so approval gating, policy denial, timeouts, and cancellation are exercised against the actual framework code.

License: MIT (this plugin). The agent-desktop CLI it invokes is a separate Apache-2.0 work.
