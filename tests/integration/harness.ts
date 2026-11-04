/**
 * Shared test helpers: a real dsh-subprocess-local spawn function pointed at
 * the fake CLI, plus context mounting in the verified order
 * (SystemPrompt → ToolRuntime → NativeToolExecutor → plugin).
 *
 * @module tests/integration/harness
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { spawn } from 'node:child_process'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { resolveConfig, type Config, type ResolvedConfig } from '../../src/config.ts'
import type { SpawnFn } from '../../src/adapter/cli.ts'

export const FAKE_CLI = join(import.meta.dirname, 'fake-cli.mjs')

/** One fake-CLI environment: log file + spawn fn with a fixed mode. */
export interface FakeCli {
  readonly spawn: SpawnFn
  readonly logPath: string
  readonly workDir: string
  setMode(mode: string): void
  invocations(): Promise<string[][]>
  cleanup(): Promise<void>
}

/**
 * Build a fake CLI environment. The spawn fn honors the subprocess seam
 * contract (argv arrays, abort-driven termination) using Node directly; this
 * mirrors how dsh-subprocess-local itself injects Node's spawn.
 */
export async function makeFakeCli(defaultMode = 'ok', configOverride: Partial<Config> = {}): Promise<FakeCli> {
  const workDir = await mkdtemp(join(tmpdir(), 'deskbridge-test-'))
  const logPath = join(workDir, 'invocations.log')
  await writeFile(logPath, '')
  let mode = defaultMode

  const spawnFn: SpawnFn = (spec: SubprocessSpawnSpec): SubprocessHandle => {
    // The config's command IS the fake CLI script; run it with node (argv[0]
    // is a .mjs file). What the fake CLI receives as process.argv.slice(2)
    // equals spec.argv.slice(1): the command word plus its arguments.
    const child = spawn(process.execPath, [spec.argv[0]!, ...spec.argv.slice(1)], {
      cwd: spec.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FAKE_CLI_MODE: mode, FAKE_CLI_LOG: logPath },
    })
    let stdout = ''
    let stderr = ''
    let settled: { exitCode: number | null; signal: NodeJS.Signals | null } | undefined
    let settleFns: Array<() => void> = []
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on('close', (exitCode, signal) => {
        settled = { exitCode, signal }
        resolve({ exitCode, signal })
        settleFns.forEach(fn => fn())
        settleFns = []
      })
      child.on('error', (error) => {
        stderr += String(error)
        settled = { exitCode: null, signal: null }
        resolve(settled)
        settleFns.forEach(fn => fn())
        settleFns = []
      })
    })
    const abort = () => { child.kill('SIGTERM') }
    spec.signal?.addEventListener('abort', abort, { once: true })
    return {
      stdin: undefined,
      stdout: child.stdout,
      stderr: child.stderr,
      control: undefined,
      collected: {
        stdout: { readFrom: () => ({ text: stdout, nextOffset: 0, lossy: false }) },
        stderr: { readFrom: () => ({ text: stderr, nextOffset: 0, lossy: false }) },
      },
      done,
      terminate: () => { child.kill('SIGTERM') },
      waitForExit: async (signal?: AbortSignal) => {
        if (settled !== undefined) return true
        await new Promise<void>(resolve => {
          settleFns.push(resolve)
          signal?.addEventListener('abort', () => resolve(), { once: true })
        })
        return settled !== undefined
      },
    }
  }

  return {
    spawn: spawnFn,
    logPath,
    workDir,
    setMode(next: string) { mode = next },
    async invocations() {
      const raw = await readFile(logPath, 'utf8')
      return raw.split('\n').filter(line => line.length > 0).map(line => JSON.parse(line) as string[])
    },
    async cleanup() { await rm(workDir, { recursive: true, force: true }) },
  }
}

/** Build a resolved config bound to the fake environment. */
export function testConfig(override: Partial<Config> = {}): ResolvedConfig {
  return resolveConfig({
    enabled: true,
    command: FAKE_CLI,
    extraArgs: [],
    probeAtStartup: false,
    acceptedEnvelopeVersions: ['2.6'],
    claimComputerUse: false,
    confirmMutating: true,
    allowedApps: [],
    observeTimeoutMs: 5000,
    interactTimeoutMs: 5000,
    typeTimeoutMs: 8000,
    maxTextLength: 1500,
    maxEnvelopeBytes: 8388608,
    screenshotDir: '',
    verboseLogging: false,
    ...override,
  })
}

/**
 * Mount the plugin on a real Cordis context in the verified order.
 * Note: the fake spawn fn replaces ctx.subprocess, so the plugin's inject
 * requirement is satisfied by pre-mounting dsh-subprocess-local or by the
 * spawn injection; this helper mounts the real services then applies the
 * plugin with the fake spawn bound through a shim plugin that overrides
 * ctx.subprocess.spawn.
 */
/**
 * Register the DeskBridge tools/policy/guidance on an ALREADY-PREPARED
 * context (caller mounts SystemPrompt → ToolRuntime → NativeToolExecutor,
 * mirroring the host's service composition; this helper plays only the plugin
 * role, like src/index.ts does against the host's services).
 *
 * Registrations are scoped to a dedicated plugin fiber (like a Loader row),
 * so the test can unload exactly the plugin without destroying the services.
 */
export async function mountPlugin(ctx: Context, config: ResolvedConfig, fake: FakeCli): Promise<() => Promise<void>> {
  const { AgentDesktopCli } = await import('../../src/adapter/cli.ts')
  const { registerPolicyGate } = await import('../../src/policy.ts')
  const { registerGuidance } = await import('../../src/guidance.ts')
  const { defineObservationTools } = await import('../../src/tools/observe.ts')
  const { defineInteractionTools } = await import('../../src/tools/interact.ts')

  // Plugin fiber: everything below registers as effects of this fiber, so
  // disposing it unregisters the tools/policy/guidance exactly like unloading
  // the plugin row does in a real host. The plugin object carries the same
  // inject list as src/index.ts so ctx.systemPrompt is available.
  const fiber = ctx.plugin({
    name: 'dsh-deskbridge-test',
    inject: ['tools', 'subprocess', 'systemPrompt'],
    apply(pluginCtx: Context) {
      const cli = new AgentDesktopCli(fake.spawn, config)
      registerPolicyGate(pluginCtx, config)
      registerGuidance(pluginCtx)
      const observation = defineObservationTools(cli, config)
      const interaction = defineInteractionTools(cli, config)
      const all = [
        observation.desktopStatus, observation.desktopListApps, observation.desktopListWindows,
        observation.desktopSnapshot, observation.desktopFind, observation.desktopGet, observation.desktopScreenshot,
        interaction.desktopClick, interaction.desktopType, interaction.desktopPress, interaction.desktopSetValue,
      ]
      for (const tool of all) pluginCtx.tools.register(tool)
    },
  })
  await fiber
  return async () => { await (fiber as unknown as { dispose: () => Promise<void> }).dispose() }
}
