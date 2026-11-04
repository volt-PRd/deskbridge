/**
 * Version-adaptive pipeline entry for integration tests.
 *
 * DeskBridge supports two dsh lines (0.2.1-rc.3+ and 0.2.2-alpha.2+), and the
 * test-only `@deepseek-ai/dsh-tool-testkit` exists only from 0.2.2-alpha.2.
 * Where the testkit is installed, its `executeToolFixture` runs the real
 * prepare → dispatch → complete pipeline for one call (identical to upstream's
 * own tool tests). On the 0.2.1 line the same traversal is entered through
 * `ToolRuntime.execute`, the exact method a native executor calls — same
 * registry code, same policy waterfalls, same approval resolution.
 *
 * @module tests/integration/pipeline
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecutionInput, ToolExecutionResult } from '@deepseek-ai/dsh-tools'

/** Minimal shape of the testkit's executeToolFixture (structural, so the 0.2.1 line — where the package is absent — type-checks without it). */
type ExecuteToolFixture = (ctx: Context, input: ToolExecutionInput) => Promise<ToolExecutionResult>

/**
 * Import a package that exists only on some dsh lines. The specifier arrives
 * as a variable, so TypeScript does not try to resolve (and reject) the module
 * on lines where it is not installed; the runtime import then either succeeds
 * or throws, which is exactly the detection we want.
 */
function optionalImport(specifier: string): Promise<unknown> {
  return import(/* @vite-ignore */ specifier)
}

let testkitFixture: ExecuteToolFixture | undefined
let testkitResolved = false

/** Resolve the testkit once; absent on the 0.2.1 line (not published there). */
async function loadTestkit(): Promise<ExecuteToolFixture | undefined> {
  if (testkitResolved) return testkitFixture
  testkitResolved = true
  try {
    const testkit = (await optionalImport('@deepseek-ai/dsh-tool-testkit')) as {
      executeToolFixture?: ExecuteToolFixture
    }
    testkitFixture = testkit.executeToolFixture
  } catch {
    testkitFixture = undefined
  }
  return testkitFixture
}

/** True when the installed dsh line ships the tool testkit (0.2.2 line). */
export async function isTestkitAvailable(): Promise<boolean> {
  return (await loadTestkit()) !== undefined
}

/** The native executor plugin module, or undefined on the 0.2.1 line (not published there). */
export type NativeToolExecutorPlugin = { apply(ctx: Context): void } | (new (ctx: Context) => unknown)

let nativeExecutor: NativeToolExecutorPlugin | undefined | null = null

/** Load the native tool executor once; absent on the 0.2.1 line. */
export async function loadNativeToolExecutor(): Promise<NativeToolExecutorPlugin | undefined> {
  if (nativeExecutor !== null) return nativeExecutor
  try {
    const mod = (await optionalImport('@deepseek-ai/dsh-tool-executor-native')) as {
      default?: unknown
    }
    const candidate = mod.default ?? mod
    nativeExecutor = candidate as NativeToolExecutorPlugin
  } catch {
    nativeExecutor = undefined
  }
  return nativeExecutor ?? undefined
}

/**
 * Run one tool call through the real dsh-tools pipeline.
 *
 * @param ctx - context with the tool services mounted.
 * @param input - the call (id, name, arguments, signal, optional agent).
 * @returns the materialized final result.
 */
export async function runToolFixture(ctx: Context, input: ToolExecutionInput): Promise<ToolExecutionResult> {
  const fixture = await loadTestkit()
  if (fixture !== undefined) return fixture(ctx, input)
  // 0.2.1 line: the registry's own entry point (what a native executor calls).
  // Its parameter/result types are spelled identically there; the 0.2.2 line
  // widened execute() to a batch shape, which is why this branch only ever
  // runs when the testkit (and with it the 0.2.2 registry) is absent. The
  // receiver must stay the service (the method reads sibling methods off
  // `this`), so bind rather than detach.
  const legacyTools = ctx.tools as unknown as { execute(input: ToolExecutionInput): Promise<ToolExecutionResult> }
  return legacyTools.execute.call(ctx.tools, input)
}
