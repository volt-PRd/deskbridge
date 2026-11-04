# Installing DeskBridge

DeskBridge is a DSH **bundle**: an npm package declaring `dsh.bundle.patch` that inserts one plugin row. Install it through the official mechanism — `dsh plugin` (which forwards to pnpm in the profile directory).

## 1. Prerequisites

- **DeepSeek Harness** (`dsh`) `>=0.2.2-alpha.2 <0.3.0` on PATH.
- **agent-desktop CLI** v1.0.x (envelope 2.6):

  ```sh
  npm install -g agent-desktop
  agent-desktop version   # {"version":"1.0.2",...}
  ```

  Platform notes: macOS needs the Accessibility permission (the CLI will report `PERM_DENIED` until granted); Windows needs no grant for ref actions; Linux needs a graphical session with `at-spi2-core` (X11 full support; Wayland limited — see TROUBLESHOOTING).

## 2. Install the plugin into a profile

From a registry name (when published), a tarball, or a local checkout:

```sh
dsh plugin --profile myprofile add dsh-deskbridge          # npm (not yet published)
dsh plugin --profile myprofile add ./dsh-deskbridge-0.1.0.tgz
dsh plugin --profile myprofile add /path/to/deskbridge     # local checkout (built: lib/ present)
dsh plugin --profile myprofile add github:<owner>/deskbridge#<sha>   # git install, see note
```

The first `add` to a new profile initializes it with `@deepseek-ai/dsh-base` and appends `dsh-deskbridge` to `dsh.profile.bundles` (the manifest declares `dsh.bundle`).

**Git-install note (from the official DSH docs):** a git dependency fetches sources, not artifacts. This package ships a `prepare` script that builds `lib/`, but pnpm ≥ 10 blocks dependency build scripts until allowed — add to the profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-deskbridge: true
```

and re-run the `add`. Treat that allowance as permission to run the package's code at install time; pin a commit (`#<sha>`). A tarball or npm install of the prebuilt package needs no allowance.

## 3. Enable and configure

The bundle ships its row **disabled** — desktop interaction requires explicit consent. Override it in the profile's `cordis.patch.yml` (`$DSH_HOME/profiles/<name>/cordis.patch.yml`), restating the row:

```yaml
- id: deskbridge
  name: dsh-deskbridge
  config:
    enabled: true
```

A patch replaces the row's whole config, so set any other keys you want in the same block (all have defaults — see [CONFIGURATION.md](CONFIGURATION.md)). If `agent-desktop` is not on PATH, point the plugin at it:

```yaml
    command: /usr/local/bin/agent-desktop
```

## 4. Verify

Without booting (composition check — shows the `# == dsh-deskbridge` layer):

```sh
dsh --profile myprofile --dump-config
```

With booting: start the profile (`dsh --profile myprofile` for the Web UI) and confirm in the session that the model reports the `desktop_*` tools, or call `desktop_status` first — it reports the CLI version, platform, and OS permissions.

## 5. Update / remove

```sh
dsh plugin --profile myprofile remove dsh-deskbridge
dsh plugin --profile myprofile add dsh-deskbridge@<version>
```

Removing the plugin unregisters all eleven tools (registration is effect-owned; unloading the row withdraws them).
