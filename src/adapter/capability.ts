/**
 * Startup capability probe: `version` + `status`, both read-only and requiring
 * no OS permissions (`src/command_policy/mod.rs` of agent-desktop). Fails with
 * an actionable message when the CLI is missing or its envelope version is
 * not accepted.
 *
 * @module dsh-deskbridge/adapter/capability
 */

import { z } from 'zod'
import { AgentDesktopCli } from './cli.ts'
import { versionData, statusData } from './views.ts'

/** What the probe learned about the installed CLI. */
export interface CapabilityReport {
  readonly cliVersion: string
  readonly target: string
  readonly os: string
  readonly platform: string
  readonly supportedSurfaces: readonly string[]
}

/**
 * Probe the CLI: run `version`, then `status`.
 *
 * @param cli - the adapter.
 * @param signal - optional cancellation.
 * @returns the capability report (CLI version, platform, surfaces).
 * @throws AgentDesktopUnavailableError / AgentDesktopEnvelopeError with an
 *   actionable message on any infrastructure failure; a `PERM_DENIED` status
 *   outcome is a SUCCESS here (permissions are reported by desktop_status).
 */
export async function probeCapability(cli: AgentDesktopCli, signal?: AbortSignal): Promise<CapabilityReport> {
  const version = await cli.run('version', ['version'], { timeoutMs: 10000, signal })
  if (!version.ok) {
    // `version` has no failure mode besides infrastructure; treat as unusable.
    throw new Error(`agent-desktop version failed: ${version.code} ${version.message}`)
  }
  const parsedVersion = versionData.parse(version.data)
  const status = await cli.run('status', ['status'], { timeoutMs: 15000, signal })
  if (!status.ok) {
    // The CLI works; status health issues surface through desktop_status later.
    return {
      cliVersion: parsedVersion.version,
      target: parsedVersion.target,
      os: parsedVersion.os,
      platform: parsedVersion.os,
      supportedSurfaces: [],
    }
  }
  const parsedStatus = statusData.parse(status.data)
  return {
    cliVersion: parsedVersion.version,
    target: parsedVersion.target,
    os: parsedVersion.os,
    platform: parsedStatus.platform,
    supportedSurfaces: parsedStatus.supported_surfaces,
  }
}

/** zod view re-exported for tests. */
export const probeReportSchema = z.object({
  cliVersion: z.string(),
  target: z.string(),
  os: z.string(),
  platform: z.string(),
  supportedSurfaces: z.array(z.string()),
})
