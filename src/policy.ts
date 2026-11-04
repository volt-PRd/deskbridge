/**
 * The tools/pre-execute policy gate.
 *
 * Observation tools pass through (subject to the app allowlist); mutating
 * tools return `{kind:'ask'}` so the DSH pipeline resolves approval through
 * the approval service — fail-closed when none is mounted (dsh-tools
 * `pipeline.ts`: an unresolved ask degrades to deny). Nothing here executes
 * or retries anything; the gate only decides.
 *
 * @module dsh-deskbridge/policy
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ResolvedConfig } from './config.ts'

/** The eleven DeskBridge tool names, by class. */
export const OBSERVATION_TOOLS = [
  'desktop_status',
  'desktop_list_apps',
  'desktop_list_windows',
  'desktop_snapshot',
  'desktop_find',
  'desktop_get',
  'desktop_screenshot',
] as const

export const MUTATING_TOOLS = [
  'desktop_click',
  'desktop_type',
  'desktop_press',
  'desktop_set_value',
] as const

export type DeskBridgeToolName = typeof OBSERVATION_TOOLS[number] | typeof MUTATING_TOOLS[number]

/** Every tool name this plugin registers (imported by tests and docs checks). */
export const TOOL_NAMES: readonly DeskBridgeToolName[] = [...OBSERVATION_TOOLS, ...MUTATING_TOOLS]

/** Tools that carry an `app` parameter subject to the allowlist. */
const APP_SCOPED_TOOLS = new Set<string>([
  'desktop_list_windows',
  'desktop_snapshot',
  'desktop_find',
  'desktop_screenshot',
])

function isDeskBridgeTool(name: string): name is DeskBridgeToolName {
  return (TOOL_NAMES as readonly string[]).includes(name)
}

function isMutating(name: string): boolean {
  return (MUTATING_TOOLS as readonly string[]).includes(name)
}

/**
 * The pure decision function: given a tool name, its parsed arguments, and
 * the resolved config, produce the pre-execute decision. Unit-testable
 * without a context; the listener below is a thin adapter.
 */
export function decidePreExecute(name: string, args: unknown, config: ResolvedConfig): PreToolDecision | 'pass' {
  if (!isDeskBridgeTool(name)) return 'pass'
  if (APP_SCOPED_TOOLS.has(name)) {
    const app = readAppArgs(args)
    if (app !== undefined && config.allowedApps.length > 0 && !config.allowedApps.includes(app)) {
      return {
        kind: 'deny',
        reason: `DeskBridge: app ${JSON.stringify(app)} is not in the configured allowedApps list`,
      }
    }
  }
  if (isMutating(name) && config.confirmMutating) {
    return {
      kind: 'ask',
      reason: `DeskBridge wants to run ${name} on the desktop (agent-desktop). This can have real-world side effects.`,
    }
  }
  return 'pass'
}

/**
 * Read the `app` argument out of already-parsed tool arguments.
 * The arguments were validated against the tool schema by the registry.
 */
function readAppArgs(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const app = (args as Record<string, unknown>).app
  return typeof app === 'string' && app.length > 0 ? app : undefined
}

/**
 * Register the DeskBridge pre-execute policy gate.
 *
 * Decision table (see {@link decidePreExecute}):
 * - non-DeskBridge tool → `next()`
 * - observation with disallowed app → deny (allowlist)
 * - observation otherwise → `next()`
 * - mutating with `confirmMutating` → `ask` with a human-readable reason
 * - mutating without confirmation → `next()`
 *
 * @param ctx - the plugin context (listener is effect-disposed).
 * @param config - resolved plugin config.
 */
export function registerPolicyGate(ctx: Context, config: ResolvedConfig): void {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const decision = decidePreExecute(exec.name, exec.arguments, config)
    if (decision === 'pass') return next()
    return decision
  })
}
