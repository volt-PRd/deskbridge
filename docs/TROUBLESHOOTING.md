# Troubleshooting

**Plugin doesn't register anything** — `enabled: true` missing (it ships `false`), or the row is still `disabled: true` from the bundle patch. Check `dsh --profile <name> --dump-config` shows the row without `disabled`.

**Startup probe failed: executable could not be started** — `agent-desktop` not on PATH for the dsh process. Fix: `npm install -g agent-desktop`, or set `config.command` to its absolute path. To defer detection to call time: `probeAtStartup: false`.

**DESKBRIDGE_ENVELOPE_INVALID … version "x.y" is not accepted** — the installed CLI is newer/older than this build's accepted envelope versions. Update the plugin, or extend `acceptedEnvelopeVersions` after reading the CLI's `docs/json-output.md` migration notes.

**PERM_DENIED (accessibility)** — macOS: System Settings → Privacy & Security → Accessibility, grant the terminal; verify with `desktop_status`. Linux: ensure a graphical session with `at-spi2-core` and `DBUS_SESSION_BUS_ADDRESS` set.

**PERM_DENIED on type (Windows)** — headless keystroke synthesis is refused; use `desktop_set_value` or run the CLI `--headed` (not exposed by this plugin yet).

**Linux: ACTION_NOT_SUPPORTED for pointer gestures / focus-window** — Wayland refuses synthesized pointer input and X11-only window management; use ref actions (`click` by ref works headless through AT-SPI).

**STALE_REF / AMBIGUOUS_TARGET loops** — expected after UI changes; take a fresh `desktop_snapshot` (or `desktop_find`) and use the new refs. Twins (identical elements) are refused by design; only a distinct control can be targeted.

**"requires approval" denials** — no approval channel is composed (headless) or the user rejected. With the Web UI composed, mutating calls prompt; in unattended setups they fail closed by design. `confirmMutating: false` disables the gate (not recommended).

**computer use provider "…" is already registered** — another desktop driver (e.g. the experimental CUA providers) holds the exclusive slot; disable it, or set `claimComputerUse: false` on DeskBridge (loses mutual exclusion).

**Screenshots fail** — screen-recording permission (macOS TCC), or on Linux Wayland the portal consent; check `desktop_status`.
