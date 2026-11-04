# Configuration reference

All keys live on the `deskbridge` row's `config:` block (a later patch layer replaces the whole config — restate what you need). Every key has a default; `enabled: true` alone is valid.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `false` | Master consent gate. `false` registers nothing. |
| `command` | string | `agent-desktop` | Executable: absolute path or PATH name. |
| `extraArgs` | string[] | `[]` | Global CLI flags appended after the binary, before the command word (e.g. `["--session","x"]`). |
| `probeAtStartup` | boolean | `true` | Fail plugin startup when the CLI is missing/unusable. |
| `acceptedEnvelopeVersions` | string[] | `["2.6"]` | Envelope versions this build validates. |
| `claimComputerUse` | boolean | `true` | Claim the exclusive computer-use provider slot. |
| `confirmMutating` | boolean | `true` | Approval-gate click/type/press/set_value. |
| `allowedApps` | string[] | `[]` | When non-empty, app-scoped tools may only target these names. |
| `observeTimeoutMs` | number | `20000` | Outer budget for observation commands. |
| `interactTimeoutMs` | number | `30000` | Outer budget for interaction commands. |
| `typeTimeoutMs` | number | `60000` | Outer budget for typing (scales with text length). |
| `maxTextLength` | number | `1500` | Max text for type/set-value/select (CLI hard cap 10000). |
| `maxEnvelopeBytes` | number | `8388608` | Collected CLI stdout cap per invocation. |
| `screenshotDir` | string | OS temp + `/deskbridge` | Directory the CLI writes screenshots into. |
| `verboseLogging` | boolean | `false` | Log tool-call names at debug (never text/argv). |

Invalid values are clamped at resolution (non-positive timeouts → defaults; `maxTextLength` forced into 1..10000; empty `acceptedEnvelopeVersions` → `["2.6"]`).
