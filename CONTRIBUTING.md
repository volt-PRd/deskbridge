# Contributing to DeskBridge

## Ground rules

- **TypeScript, ESM, strict.** `pnpm typecheck` and `pnpm run build` must pass. Follow the existing style: explicit types on exports, `readonly` where honest, no `any` without a comment saying why.
- **Subprocess security is load-bearing.** All CLI invocation goes through `src/adapter/cli.ts` (`AgentDesktopCli.run`) and `src/adapter/argv.ts` (the only place flags are spelled). Never introduce `exec`/shell-string spawning, never widen validation (`src/validation.ts`), never add retry logic for delivered actions. A PR that weakens any guard in SECURITY.md needs an explicit, reviewed justification.
- **Errors**: domain failures (CLI `ok:false`) are canonical values; only infrastructure failures throw `HarnessError` subclasses from `src/adapter/errors.ts` with stable codes.
- **New CLI commands**: verify exact flags/positional order against the agent-desktop source (`src/cli_args/`), add an argv builder, a zod view in `src/adapter/views.ts`, validation, tests, and TOOLS.md docs in the same PR. Classify the tool observation vs interaction (drives the approval gate and `isConcurrencySafe`).

## Tests

- Every PR adds or updates tests for the behavior it changes. `pnpm test` (64 tests) must pass — unit (envelope/argv/validation/config/policy) and integration (real dsh-tools pipeline + fake CLI: approval allow/deny, stale refs, timeouts, abort, dispose/HMR).
- Deterministic only: no real desktop, no real CLI, no sleeps beyond explicit timeout tests. New fake-CLI modes go in `tests/integration/fake-cli.mjs`.

## Commits & PRs

- Conventional-ish subjects: `fix(envelope): accept 2.7 recovery shape`, `feat(tools): add desktop_scroll`, `docs: ...`, `test: ...`, `chore: ...`. Imperative, one logical change per commit.
- PRs describe what + why, list testing evidence (command + summary), and call out breaking changes (config keys, tool names, error codes) in bold at the top. Update README/docs/TOOLS.md in the same PR.
- **Never commit credentials, tokens, or private desktop content** (screenshots, snapshot dumps). Dependencies must be justified in the PR text; no new runtime dependency without discussion.
- Compatibility: `engines.dsh` and peer ranges change only in a release PR that documents the migration.

## Releases

`pnpm run build` → version bump (semver; breaking = major) → tag → optional `pnpm publish` (maintainer-only, never in a PR).
