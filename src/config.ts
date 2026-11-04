/**
 * Plugin configuration: schemastery schema (runtime validator + settings
 * surface) with a typed interface, following the tool-todo convention.
 * Every key has a default, so `enabled: true` alone is a valid configuration.
 *
 * @module dsh-deskbridge/config
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** DeskBridge plugin configuration. */
export interface Config {
  /** Master consent gate: false registers nothing. Default false. */
  enabled: boolean
  /** Executable to run: absolute path, or a name resolved on PATH. Default "agent-desktop". */
  command: string
  /** Static extra arguments appended to every invocation (e.g. ["--session", "x"]). */
  extraArgs: string[]
  /** Fail plugin startup when the CLI is missing/old. Default true. */
  probeAtStartup: boolean
  /** Envelope versions accepted from the CLI. Default ["2.6"]. */
  acceptedEnvelopeVersions: string[]
  /** Claim the exclusive computer-use provider slot. Default true. */
  claimComputerUse: boolean
  /** Require approval for mutating tools (click/type/press/set_value). Default true. */
  confirmMutating: boolean
  /** When non-empty, `app`-carrying tools are restricted to these names. */
  allowedApps: string[]
  /** Outer timeout for observation commands, ms. Default 20000. */
  observeTimeoutMs: number
  /** Outer timeout for interaction commands, ms. Default 30000. */
  interactTimeoutMs: number
  /** Outer timeout for typing, ms. Default 60000. */
  typeTimeoutMs: number
  /** Maximum text length accepted for type/set-value/select. Default 1500 (CLI hard cap 10000). */
  maxTextLength: number
  /** Maximum collected stdout bytes per invocation. Default 8 MiB. */
  maxEnvelopeBytes: number
  /** Directory the CLI writes screenshots into. Default: OS temp dir + /deskbridge. */
  screenshotDir: string
  /** Log full argv at debug level (argv may contain typed text). Default false. */
  verboseLogging: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false).description('Master switch: desktop tools register only when true (explicit consent)'),
  command: z.string().default('agent-desktop').description('agent-desktop executable: absolute path or PATH name'),
  extraArgs: z.array(z.string()).default([]).description('Extra arguments appended to every CLI invocation'),
  probeAtStartup: z.boolean().default(true).description('Fail startup when the CLI is missing or its envelope version is unaccepted'),
  acceptedEnvelopeVersions: z.array(z.string()).default(['2.6']).description('agent-desktop JSON envelope versions this build accepts'),
  claimComputerUse: z.boolean().default(true).description('Claim the exclusive computer-use provider slot (one desktop driver per DSH instance)'),
  confirmMutating: z.boolean().default(true).description('Route mutating tool calls through the approval service before execution'),
  allowedApps: z.array(z.string()).default([]).description('When non-empty, only these application names may be targeted'),
  observeTimeoutMs: z.number().default(20000).description('Outer timeout for observation commands (status/snapshot/find/...)'),
  interactTimeoutMs: z.number().default(30000).description('Outer timeout for interaction commands (click/press/set_value)'),
  typeTimeoutMs: z.number().default(60000).description('Outer timeout for typing (scales with text length)'),
  maxTextLength: z.number().default(1500).description('Maximum text length for type/set-value/select (CLI hard cap is 10000)'),
  maxEnvelopeBytes: z.number().default(8388608).description('Maximum collected CLI stdout bytes per invocation'),
  screenshotDir: z.string().default('').description('Directory for screenshots (default: OS temp dir)'),
  verboseLogging: z.boolean().default(false).description('Log full CLI argv (may contain typed text) at debug level'),
})

/** Resolved configuration: fills computed defaults (screenshotDir, validation clamps). */
export interface ResolvedConfig extends Config {
  screenshotDir: string
}

import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Normalize raw config: apply bounds and compute the screenshot directory.
 * @param config - parsed plugin config (possibly partial from schemastery defaults).
 * @returns the resolved config every component receives.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  const clampPositive = (value: number, fallback: number): number =>
    Number.isFinite(value) && value > 0 ? value : fallback
  return {
    ...config,
    extraArgs: config.extraArgs.filter(arg => typeof arg === 'string' && arg.length > 0),
    acceptedEnvelopeVersions: config.acceptedEnvelopeVersions.length > 0 ? config.acceptedEnvelopeVersions : ['2.6'],
    observeTimeoutMs: clampPositive(config.observeTimeoutMs, 20000),
    interactTimeoutMs: clampPositive(config.interactTimeoutMs, 30000),
    typeTimeoutMs: clampPositive(config.typeTimeoutMs, 60000),
    maxTextLength: Math.min(Math.max(1, clampPositive(config.maxTextLength, 1500)), 10000),
    maxEnvelopeBytes: clampPositive(config.maxEnvelopeBytes, 8388608),
    screenshotDir: config.screenshotDir.length > 0 ? config.screenshotDir : join(tmpdir(), 'deskbridge'),
  }
}

/** Type-only marker: the plugin's `apply` signature. */
export type PluginApply = (ctx: Context, config: Config) => void | Promise<void>
