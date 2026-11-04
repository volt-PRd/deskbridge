/**
 * The subprocess execution layer: the ONLY place DeskBridge spawns the
 * agent-desktop CLI.
 *
 * Every invocation goes through the DSH subprocess seam
 * (`@deepseek-ai/dsh-subprocess`, mounted by dsh-base as `ctx.subprocess`)
 * with an argv array — the seam contract states argv is "Never
 * shell-interpreted here" — bounded collected stdout, a grace period, and an
 * abort signal wired to the tool call's `exec.signal`. The spawn function is
 * injectable so tests drive this class against a fake CLI without a real
 * binary, mirroring how `dsh-subprocess-local` injects Node's spawn.
 *
 * @module dsh-deskbridge/adapter/cli
 */

import type { SubprocessHandle, SubprocessRuntime, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { AgentDesktopAbortedError, AgentDesktopTimeoutError, AgentDesktopUnavailableError } from './errors.ts'
import { type CliResult, parseEnvelope } from './envelope.ts'
import type { ResolvedConfig } from '../config.ts'

/** The spawn surface this adapter needs from the subprocess seam. */
export type SpawnFn = (spec: SubprocessSpawnSpec) => SubprocessHandle

/** Extract the spawn function from the runtime (also accept a bare function for tests). */
export function spawnFrom(runtime: SubprocessRuntime | SpawnFn): SpawnFn {
  return typeof runtime === 'function' ? runtime : (spec: SubprocessSpawnSpec) => runtime.spawn(spec)
}

/** Options for one CLI invocation. */
export interface RunOptions {
  /** Cancellation from the tool call (`exec.signal`); triggers terminate escalation. */
  readonly signal?: AbortSignal | undefined
  /** Outer budget in milliseconds; the process is terminated when it elapses. */
  readonly timeoutMs: number
  /** Termination grace before hard escalation. Default 2000. */
  readonly graceMs?: number | undefined
}

/**
 * One agent-desktop CLI invocation bound to a spawn function and config.
 * Domain failures (`ok:false` envelopes) are returned, not thrown.
 */
export class AgentDesktopCli {
  private readonly spawn: SpawnFn
  private readonly config: ResolvedConfig

  constructor(spawn: SpawnFn, config: ResolvedConfig) {
    this.spawn = spawn
    this.config = config
  }

  /**
   * Run one command and validate its envelope.
   *
   * @param command - the kebab-case command name (envelope must echo it).
   * @param commandArgs - the argv-builder output: the command word followed by
   *   its arguments (already validated). The command word is verified to match
   *   so a builder/run mismatch cannot silently corrupt the invocation.
   * @param options - timeout, cancellation, grace.
   * @returns the validated result; `ok:false` for CLI-reported domain errors.
   * @throws AgentDesktopUnavailableError when the executable cannot spawn.
   * @throws AgentDesktopTimeoutError when the outer budget elapses.
   * @throws AgentDesktopAbortedError when cancelled through `options.signal`.
   * @throws AgentDesktopEnvelopeError for output violating the contract.
   */
  async run(command: string, commandArgs: readonly string[], options: RunOptions): Promise<CliResult<unknown>> {
    if (commandArgs[0] !== command) {
      throw new Error(`internal: argv builder output must start with the command word "${command}"`)
    }
    // extraArgs sit directly after the binary: they are global CLI flags
    // (e.g. --session), which must precede the command word.
    const argv: readonly string[] = [this.config.command, ...this.config.extraArgs, ...commandArgs]
    const graceMs = options.graceMs ?? 2000
    const timeoutController = new AbortController()
    const onTimeout = (): void => timeoutController.abort()
    const timer = setTimeout(onTimeout, options.timeoutMs)
    let timedOut = false
    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        clearTimeout(timer)
        throw new AgentDesktopAbortedError(`agent-desktop "${command}" was cancelled before it started`)
      }
      options.signal.addEventListener('abort', () => timeoutController.abort(), { once: true })
    }

    let handle: SubprocessHandle
    try {
      handle = this.spawn({
        argv,
        cwd: process.cwd(),
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: this.config.maxEnvelopeBytes },
          stderr: { maxBytes: 65536 },
        },
        graceMs,
        signal: timeoutController.signal,
      })
    } catch (cause) {
      clearTimeout(timer)
      throw new AgentDesktopUnavailableError(
        `agent-desktop executable ${JSON.stringify(this.config.command)} could not be started; ` +
        'install it with "npm install -g agent-desktop" or set the plugin config "command" to its path',
        { cause },
      )
    }

    let outcome: Awaited<SubprocessHandle['done']>
    try {
      outcome = await handle.done
    } catch (cause) {
      clearTimeout(timer)
      if (options.signal?.aborted) {
        throw new AgentDesktopAbortedError(`agent-desktop "${command}" was cancelled`, { cause })
      }
      if (timedOut) {
        throw new AgentDesktopTimeoutError(
          `agent-desktop "${command}" did not settle within ${options.timeoutMs} ms and was terminated`,
          { cause },
        )
      }
      throw new AgentDesktopUnavailableError(`agent-desktop "${command}" failed to run`, { cause })
    } finally {
      clearTimeout(timer)
    }

    if (timeoutController.signal.aborted) {
      timedOut = true
    }
    if (timedOut && outcome.exitCode !== 0) {
      if (options.signal?.aborted) {
        throw new AgentDesktopAbortedError(`agent-desktop "${command}" was cancelled while running`)
      }
      throw new AgentDesktopTimeoutError(
        `agent-desktop "${command}" exceeded its ${options.timeoutMs} ms budget and was terminated`,
      )
    }

    const stdoutReader = handle.collected.stdout
    const stdout = stdoutReader === undefined ? '' : stdoutReader.readFrom(0).text
    return parseEnvelope(stdout, command, this.config.acceptedEnvelopeVersions)
  }
}
