# The DeepSeek Harness external plugin system — verified findings

Research for DeskBridge (`dsh-deskbridge`), a third-party plugin integrating Vercel Labs'
[agent-desktop](https://github.com/vercel-labs/agent-desktop) into
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH, `dsh`).

Everything below was verified against a source checkout of `deepseek-harness` at commit
`ce7073d51254c26cd63b22a60835b8f948deb447` (2026-10-30, workspace version `0.2.2-alpha.2`)
and cross-checked against the packages published to npm under `@deepseek-ai/*` (all
0.2.2-line versions exist on the registry; `@deepseek-ai/dsh` is the CLI package).
Paths are relative to the repository root unless absolute. Items marked **[A]** are
assumptions or decisions of this project, not facts of the upstream source.

---

## 1. What "plugin" means in DSH, and what makes one *external*

A DSH plugin is a TypeScript/JavaScript module exporting `apply(ctx, config)` plus optional
metadata (`name`, `inject`, `Config`, `provide`) — `vendor/cordis/src/registry.ts:92-133`
(`Plugin.Function<T> = (ctx: Context, config: T) => any`). There is **no registration
registry for plugins themselves**: a plugin runs when a *configuration row* names it, and
rows live in layered YAML files.

The decisive distinction is **where the row comes from**:

| | Built-in (in-box) | Independently installable |
|---|---|---|
| Code location | shipped inside the `@deepseek-ai/dsh` CLI installation's own package tree | a separate npm package the user installs into a *profile* |
| Row source | shipped bundles (`@deepseek-ai/dsh-base`, `dsh-web-app`, …) resolved from the dsh installation itself | the package's own `cordis.patch.yml`, applied as a bundle layer |
| Managed by | the dsh release | `dsh plugin` / pnpm in the profile directory |

`docs/user/develop/basic/publish.md` states this exactly: *"In-box bundle names always
resolve from the dsh installation itself; pnpm manages only out-of-tree packages."*
An internal plugin implementation does **not** automatically qualify as external — the
external mechanism is the **bundle** format (§2).

## 2. Bundles: the official external distribution format

A **bundle** is an npm package whose `package.json` declares, under a `dsh` key, a patch
file that inserts or overrides plugin rows (`docs/user/develop/basic/publish.md`):

```jsonc
{
  "name": "dsh-hello-plugin",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

The patch is a YAML array of operations (`- insert:` rows, or `- id: …` to replace an
existing row). Verified grammar from `packages/bundle/base/cordis.patch.yml`:

```yaml
- insert:
    - id: subprocess            # row id (later layers target/override by this id)
      name: '@deepseek-ai/dsh-subprocess-local'   # module specifier Loader imports
      disabled: true             # optional: off by default
      config: { … }              # optional plugin config (whole-value replacement)
```

`patch` may also be an ordered list of files. **A package without `dsh.bundle` installs
only as a plain library dependency — `dsh plugin` warns and activates no layer.**

Row keys verified in shipped patches: `id`, `name`, `disabled` (boolean or `!!js`
expression), `config`, `inject`, plus per-plugin keys. `!!js` expressions are evaluated
against the row's context (e.g. `disabled: !!js "!ctx.get('profileContext')"`).

### Compatibility gating

- `engines.dsh` — a SemVer range the running DSH must satisfy. *"Installation and profile
  startup refuse a bundle whose range the running DSH does not satisfy; without
  `engines.dsh`, they check its `@deepseek-ai/dsh*` peer dependency ranges instead"*
  (`docs/user/develop/basic/publish.md`, rule in `packages/boot/app-boot/README.md`).
- The plugin manager re-checks peers on `add` **before** pnpm runs for registry specs;
  git/tarball specs are judged after fetch with manifest+lockfile restoration on failure
  (`packages/boot/plugin-manager/README.md` "Version compatibility and exemptions").
- Escape hatch: per-profile `compatibility.json` exemptions (`dsh plugin … allow-version
  … --accept-risk`) — DeskBridge does not rely on it.

## 3. Profiles: where external plugins are installed

A **profile** is a directory under `$DSH_HOME/profiles/<name>` with two files
(`docs/user/develop/basic/publish.md`):

- `package.json` — out-of-tree dependencies (managed by pnpm) plus
  `dsh.profile.bundles`: the ordered bundle list applied after `@deepseek-ai/dsh-base`.
- `cordis.patch.yml` — the user's own layer, applied after every bundle layer.

Users never write these by hand: `dsh plugin` creates a base-backed profile and maintains
the bundle list; `dsh --profile <name> --from-default-profile <template>` clones a
shipped template. Layer order (later wins per row, config replaced whole-value):
bundles in list order → profile patch → `$DSH_HOME/cordis.patch.yml` → `--patch` overlays.

## 4. Discovery, installation, loading, update, removal

All verified from `docs/cli-help.md`, `docs/user/develop/basic/publish.md`, and
`packages/boot/plugin-manager/README.md`:

- **Install:** `dsh plugin --profile <name> add <spec>` — forwards to pnpm in the profile
  directory (every pnpm verb works). On success pnpm links/installs the package **and**
  `dsh` appends it to `dsh.profile.bundles` because the manifest declares `dsh.bundle`.
  Specs: registry name, `./local-path`, `github:owner/repo[#sha]`, tarball.
- **Git-install catch:** a git dependency fetches sources, not artifacts — the author
  ships a `prepare` script (pnpm runs it after git install), and the user must allow the
  build in the profile's `pnpm-workspace.yaml` (`allowBuilds: <pkg>: true`, pnpm ≥ 10).
  Registry/tarball installs of prebuilt `lib/` output need no allowance. **[A] DeskBridge
  ships a `prepare` script AND documents the tarball path; the GitHub repo is private, so
  realistic installs are local path, tarball (`pnpm pack`), or a future npm publish.**
- **Discover (without booting):** `dsh --profile <name> --dump-config` — prints the
  composed layers; a working install shows a `# == <bundle>` section for the plugin.
- **Load:** `dsh --profile <name>` boots the stack; the real Loader
  (`@deepseek-ai/cordis-plugin-loader`) imports each row's `name` through Node resolution
  **from the profile directory**, so the installed package's entry point is what runs.
  With HMR enabled (YAML-controlled), config changes apply without restart.
- **Enable/disable:** rows carry `disabled:`; the Web plugin page and `dsh plugin` toggle
  bundle selection. Turning off only deselects the layer.
- **Update:** `updateBundle(name, version)` replaces an updatable bundle (registry spec,
  semver version); Web UI lists newer versions with dist-tags and compatibility records.
- **Remove:** `dsh plugin --profile <name> remove <package>` removes dependency + layer.
- **Repository discovery:** the DSH README asks plugin authors to add the GitHub topic
  `dsh-plugin` for discoverability.

### Module resolution for linked/installed packages

`docs/user/develop/basic/publish.md` (rules from
`.agents/notes/implemented/architecture/2026-09-19-profile-resolution-lookup-order.md`):
ordinary imports follow Node ancestor order with per-directory peer declarations; dsh
packages that must share the host's instance belong under **both** `peerDependencies`
and `devDependencies` — the peer is satisfied by the running installation when present,
the devDependency serves type checking and standalone tests. Independent third-party
code and stateless utilities go under `dependencies`.

## 5. Plugin lifecycle (runtime)

Verified from `vendor/cordis/src/` and `docs/user/develop/basic/index.md`:

- **Definition:** module exports — `name?: string`, `inject?: string[]` (services that
  must be available before `apply` runs), `Config?: StandardSchemaV1` (schemastery
  object), `apply(ctx, config)`.
- **Mount:** the Loader imports the module and Cordis calls `apply` with a fresh `ctx`
  scoped to the plugin fiber, after injections resolve.
- **Effects and disposal:** registrations through `ctx` (event listeners, tools, timers,
  `ctx.effect(...)`) are collected and unwound in reverse order when the plugin fiber
  unloads — `vendor/cordis/src/fiber.ts:421-423`. There is **no `'dispose'` event**;
  explicit cleanup uses `ctx.effect(() => disposer)`. `ctx.fiber.dispose()` unloads.
- **Config:** `apply` receives the parsed config (defaults from `static Config` /
  `Config` export). Config changes with HMR reload the plugin.
- **Hot-swap discipline** (needed for DSH's HMR-safety tests): to hot-swap state, dispose
  the owning effect and re-register.

## 6. Tool registration and execution (the API DeskBridge uses)

All in `@deepseek-ai/dsh-tools` (`packages/core/tools/`):

- **`ctx.tools.register(definition, options?)`** — `src/index.ts:128`; effect-owned
  disposer; name `run_code` reserved; duplicate names in one layer fail.
- **`defineTool(options)`** — `src/schema.ts:555`; typed factory. Key fields
  (`DefineToolOptions`, `src/schema.ts:484`):
  - `parameters`: DSH's **own JSON-value schema DSL** (`ParameterSchemaSpec`,
    `src/schema.ts:86-107`) — an implicit open object root of properties, each a
    `ValueSchemaSpec` (`string|number|integer|boolean|null|array|object|json|oneOf`)
    with optional `required: true`, `enum`/`const`, `description`. **Not Zod** — Zod is
    fine for *internal* validation (tool-todo uses both), but model-facing parameters
    must use this DSL; `defineTool` validates arguments against it before `execute`.
  - `output`: `{ schema: ValueSchemaSpec, render(args, value): ContentBlock[],
    presentationMeta? }` — `execute` returns only the canonical JSON value; the registry
    validates it against `output.schema`, freezes it, and hands it to `render`.
  - `execute(args, exec)` — `exec: ToolRunContext` extends `ToolExecution` whose
    `signal: AbortSignal` is *"Required caller-owned cancellation for this invocation"*
    (`src/contracts.ts:201`); bodies must honor it. `exec.agent` is the calling agent.
  - `timeoutMs?: number` — cooperative per-tool budget (enforced by
    `dsh-tool-call-timeout-policy` in dsh-base, `packages/guard/timeout-policy/`).
  - `isConcurrencySafe?(args)` — whether the call may join a parallel group.
- **Pipeline events** (`src/events.ts:18-56`, `src/pipeline.ts`):
  `tools/pre-execute` (waterfall; allow/deny/cancel/ask) → `tools/execute` (around
  dispatch; may replace `exec.signal`) → `tools/post-execute` (accept/block/replace) →
  `tools/result` (observation). Async gates must observe `exec.signal`.
- **Throwing** surfaces to the model as an `isError` result (`Error: <message>`,
  `src/pipeline.ts:695-703`); a non-ideal *domain* outcome belongs in a successful
  canonical value instead (`docs/cookbook/adding-a-tool.md`).

## 7. Permissions and approval

- There is **no declarative "needs confirmation" field** on tool definitions. Approval is
  policy-layer: a `tools/pre-execute` listener returns `{ kind: 'ask', reason }` and the
  pipeline resolves it through the approval seam (`src/pipeline.ts:432-473`):
  `ctx.get('approval')` → `approval.request({ agent, toolName, callId?, reason?, signal? })`
  → `'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`.
  **Fail-closed**: no approval service mounted (or no agent) → `ask` degrades to deny
  (`"requires approval (not yet supported)"`).
- `ctx.tools.guard(fn)` adds a monotonic final denial later listeners cannot undo
  (`src/contracts.ts:391`).
- ApprovalService (`@deepseek-ai/dsh-user-approval`, `packages/interaction/user-approval/src/index.ts:167`):
  `static inject = ['sessionProjections']`, `request(req: ApprovalRequest)`, session
  policy `'ask' | 'never'`, audit events on the requesting session. The Web UI composes
  interactive answerers; headless deployments fail closed.

## 8. Configuration, settings, logging

- **Plugin config:** schemastery `z.object({...})` exported as `Config` (runtime
  validator + settings surface). Pattern from `packages/todo/tool-todo/src/index.ts`:
  `export interface Config {…}` + `export const Config: z<Config> = z.object({…})`.
- **Logging:** `ctx.logger` (callable, `.error/.warn/.info/.debug`) —
  `vendor/cordis/src/logger.ts:135-194`; real usage
  `packages/shell/tool-bash/src/index.ts:522`.
- **Structured errors:** `HarnessError` from `@deepseek-ai/dsh-llm`
  (`packages/llm/llm/src/error.ts:13`) — stable `code` string; *"route on this, never by
  parsing message"*.

## 9. The subprocess seam (how DeskBridge spawns the CLI)

`@deepseek-ai/dsh-subprocess` (`packages/subprocess/subprocess/src/index.ts:117`):

```ts
export abstract class SubprocessRuntime extends Service {
  // registers as ctx.subprocess; one implementation per composition
  abstract resolveExecutable(command: string, env?, signal?): Promise<string>
  abstract spawn(spec: SubprocessSpawnSpec): SubprocessHandle
}
```

`SubprocessSpawnSpec` (`src/types.ts:77`): `argv: readonly string[]` — *"Never
shell-interpreted here"* — plus explicit `cwd`, `stdio`, `graceMs`, `signal?`
(abort-triggered terminate escalation), `env?` (merged onto a scrubbed parent env;
`scrubbedParentEnv` strips secret-shaped entries). `SubprocessHandle` exposes collected
bounded output readers (`SubprocessCollect { maxBytes, spill? }`), raw pipes, `done:
Promise<SubprocessOutcome>` (`{exitCode, signal}`), idempotent `terminate()`.

**A provider is mounted by dsh-base** (row `id: subprocess` →
`@deepseek-ai/dsh-subprocess-local`, `packages/bundle/base/cordis.patch.yml:234-235`), so
`inject: ['subprocess']` resolves in every base-backed profile (web, headless, sdk, acp).

## 10. Computer-use provider registry (optional placement)

`@deepseek-ai/dsh-computer-use` (`packages/computer-use/computer-use/src/index.ts`):
`ctx.computerUse.register(ComputerUseProviderName(name))` reserves **one exclusive slot**
(a second registration throws, even repeating the name); the registry stores only the
name — *"Each provider supplies its upstream tool catalog"*; there is no operations
interface to implement (`docs/subsystems/computer-use.md`, decision record
`.agents/notes/implemented/architecture/2026-09-12-computer-use-provider-registration.md`
explicitly rejected a unified action API). Providers release the registration only after
their tools stop and owned work settles.

## 11. System prompt sections

`ctx.systemPrompt.section({ name, order, text })` registers an ordered section and
returns its disposer (`packages/core/system-prompt/src/index.ts:485`); duplicate names
throw. Centrally allocated positions exist — e.g. `TOOL_COMPUTER_USE: 3000`
(`src/index.ts:163`), read via `ctx.systemPrompt.getSectionOrder('TOOL_COMPUTER_USE')`
(usage: `packages/experimental/cua/src/index.ts:326`).

## 12. Testing infrastructure for tool plugins

- `@deepseek-ai/dsh-tool-testkit` (`packages/test-support/tool-testkit/src/index.ts`):
  `executeToolFixture(ctx, input)` runs the real `prepare → dispatch → complete`
  pipeline for one call; `executeModelToolFixture` runs through the selected executor.
- Mount pattern for tool tests (`packages/todo/tool-todo/tests/tool-todo.spec.ts`):
  `new Context()` → `ctx.plugin(SystemPrompt)` → `ctx.plugin(ToolRuntime)` →
  `ctx.plugin(NativeToolExecutor)` → `ctx.plugin(plugin, config)`. `ToolsService`
  itself injects `systemPrompt`, so SystemPrompt must mount first.
- Loader composition test (`packages/todo/tool-todo/tests/loader-composition.spec.ts`):
  writes a real `cordis.yml`, boots `@deepseek-ai/cordis-plugin-loader` with
  `ctx.loader.internal` mapping specifiers to in-process modules, then drives the tool
  through `executeToolFixture` — proves the official Loader path without a full profile.
- Policy (`docs/testing.md`): mock only the expensive or non-deterministic boundary;
  product-visible plugins need a Loader-booted composition test and dispose (HMR-safety)
  coverage.

## 13. Conclusions for DeskBridge

1. Ship as a **bundle**: `package.json` with `dsh.bundle.patch → ./cordis.patch.yml`,
   `engines.dsh` range, DSH runtime-shared packages as peers, `zod`/`schemastery` as
   dependencies; built `lib/` output plus `prepare` script for git installs.
2. Register tools with `defineTool` + `ctx.tools.register` (effect-owned); DSL for
   model-facing parameters; zod for the agent-desktop JSON envelope internally.
3. Gate mutations with a `tools/pre-execute` listener returning `{kind: 'ask'}` — the
   framework resolves approval, fail-closed. No retry logic anywhere.
4. Spawn the CLI exclusively through `ctx.subprocess.spawn` with argv arrays
   (`inject: ['subprocess']`); forward `exec.signal`; bound output via collect caps.
5. Claim the exclusive computer-use slot via the ordered-effect pattern with a config
   escape hatch (`claimComputerUse: false`).
6. Contribute one prompt section at the `TOOL_COMPUTER_USE` position teaching the
   snapshot → act → verify loop.
7. Tests: unit (envelope/argv/validation/policy/config), integration against the real
   `@deepseek-ai/dsh-tools` pipeline from npm with a fake CLI, a Loader composition
   test, and dispose cleanliness.
