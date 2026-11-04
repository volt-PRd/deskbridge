/**
 * DeskBridge — a DeepSeek Harness plugin exposing Vercel Labs' agent-desktop
 * CLI as model-facing tools.
 *
 * One plugin, eleven tools (desktop_status, desktop_list_apps,
 * desktop_list_windows, desktop_snapshot, desktop_find, desktop_get,
 * desktop_click, desktop_type, desktop_press, desktop_set_value,
 * desktop_screenshot) over one shared subprocess execution layer
 * (`adapter/cli.ts`), with an approval gate on every mutating call
 * (`policy.ts`), a system-prompt section teaching the observe-act-verify
 * loop (`guidance.ts`), and an optional exclusive computer-use provider
 * registration.
 *
 * Lifecycle: the plugin is disabled unless config `enabled: true` (explicit
 * consent). When enabled it probes the CLI (config `probeAtStartup`),
 * registers the policy gate, the guidance section, the computer-use claim,
 * and the tools — each through effect-owned registrations, so unloading the
 * plugin fiber unregisters everything (HMR-safe).
 *
 * @module dsh-deskbridge
 */

import type { Context } from '@deepseek-ai/cordis'
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand'
// Type-only: pulls in the ctx.subprocess / ctx.computerUse service declarations.
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-computer-use'
import { spawnFrom, AgentDesktopCli } from './adapter/cli.ts'
import { probeCapability } from './adapter/capability.ts'
import { Config, resolveConfig, type ResolvedConfig } from './config.ts'
import { registerPolicyGate } from './policy.ts'
import { registerGuidance } from './guidance.ts'
import { defineObservationTools } from './tools/observe.ts'
import { defineInteractionTools } from './tools/interact.ts'

export const name = 'dsh-deskbridge'
export const inject = ['tools', 'subprocess', 'systemPrompt']

export { Config }
export type { ResolvedConfig }

/**
 * Mount DeskBridge.
 *
 * @param ctx - the plugin context.
 * @param config - parsed plugin configuration.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved = resolveConfig(config)
  const logger = ctx.logger('deskbridge')

  if (!resolved.enabled) {
    logger.info('disabled: set config "enabled: true" to register desktop tools')
    return
  }

  const cli = new AgentDesktopCli(spawnFrom(ctx.subprocess), resolved)

  if (resolved.probeAtStartup) {
    try {
      const report = await probeCapability(cli)
      logger.info(`agent-desktop ${report.cliVersion} ready (${report.platform}/${report.target})`)
    } catch (error) {
      // Fail activation loudly with an actionable message: a broken desktop
      // backend should not surface as confusing per-tool failures later.
      throw new Error(
        `DeskBridge startup probe failed: ${error instanceof Error ? error.message : String(error)}. ` +
        'Install agent-desktop ("npm install -g agent-desktop") or point the plugin config "command" at it; ' +
        'or set config "probeAtStartup: false" to defer detection to tool calls.',
        { cause: error },
      )
    }
  }

  // The exclusive computer-use slot: one desktop driver per DSH instance.
  // Escape hatch: claimComputerUse: false coexists with other providers.
  if (resolved.claimComputerUse) {
    ctx.effect(function* () {
      yield ctx.computerUse.register(ComputerUseProviderName('deskbridge'))
    }, 'deskbridge.computerUse')
  }

  registerPolicyGate(ctx, resolved)
  registerGuidance(ctx)

  const observation = defineObservationTools(cli, resolved)
  const interaction = defineInteractionTools(cli, resolved)

  // Tool registration is effect-owned: disposing the plugin fiber unregisters.
  ctx.tools.register(observation.desktopStatus)
  ctx.tools.register(observation.desktopListApps)
  ctx.tools.register(observation.desktopListWindows)
  ctx.tools.register(observation.desktopSnapshot)
  ctx.tools.register(observation.desktopFind)
  ctx.tools.register(observation.desktopGet)
  ctx.tools.register(observation.desktopScreenshot)
  ctx.tools.register(interaction.desktopClick)
  ctx.tools.register(interaction.desktopType)
  ctx.tools.register(interaction.desktopPress)
  ctx.tools.register(interaction.desktopSetValue)

  if (resolved.verboseLogging) {
    logger.warn('verboseLogging is on: CLI argv (which may contain typed text) will be logged at debug level')
    ctx.on('tools/pre-execute', async (exec, next) => {
      if (exec.name.startsWith('desktop_')) {
        logger.debug(`tool call: ${exec.name}`)
      }
      return next()
    })
  }

  logger.info(`registered ${11} desktop tools (agent-desktop bridge)`)
}

export default apply
