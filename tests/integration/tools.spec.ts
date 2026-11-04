/**
 * Integration tests: the eleven DeskBridge tools driven through the REAL
 * dsh-tools execution pipeline (executeToolFixture: prepare → dispatch →
 * complete, including pre-execute policy and approval resolution) against
 * the fake CLI. Approval is exercised through a lightweight service under
 * the 'approval' service name — exactly the seam the pipeline looks up.
 *
 * @module tests/integration/tools.spec
 */

import { describe, expect, it, afterEach } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { mountPlugin, makeFakeCli, testConfig, type FakeCli } from './harness.ts'

let fake: FakeCli | undefined

afterEach(async () => {
  await fake?.cleanup()
  fake = undefined
})

/** A real Agent stand-in backed by a real Session (approval routing needs it). */
function agentWithSession(id: string): Agent {
  const session = Session.create(SessionId(id))
  return { id: SessionId(id), session } as unknown as Agent
}

/** The approval seam double: registers under 'approval' like ApprovalService. */
class ApprovalDouble extends Service {
  constructor(ctx: Context, private readonly outcome: ApprovalOutcome) {
    super(ctx, 'approval')
  }

  async request(_req: ApprovalRequest): Promise<ApprovalOutcome> {
    return this.outcome
  }
}

let callCounter = 0
function call(ctx: Context, name: string, args: unknown, agent?: Agent, signal?: AbortSignal) {
  callCounter += 1
  return executeToolFixture(ctx, {
    signal: signal ?? new AbortController().signal,
    callId: ToolCallId(`call-${callCounter}`),
    name,
    arguments: args,
    ...agent !== undefined ? { agent } : {},
  })
}

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

interface SetupOptions {
  approval?: ApprovalOutcome
  mode?: string
  config?: Parameters<typeof testConfig>[0]
}

/** Boot a context with services, optional approval double, and the plugin. */
interface SetupResult { ctx: Context; unload: () => Promise<void> }

async function setup(options: SetupOptions = {}): Promise<SetupResult> {
  fake = await makeFakeCli(options.mode ?? 'ok')
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  // The subprocess seam the real plugin injects (dsh-base mounts this provider).
  await ctx.plugin(SubprocessLocal)
  if (options.approval !== undefined) {
    await ctx.plugin((context: Context) => {
      new ApprovalDouble(context, options.approval!)
    })
  }
  const unload = await mountPlugin(ctx, testConfig(options.config), fake)
  return { ctx, unload }
}

describe('DeskBridge tools through the real pipeline', () => {
  it('registers exactly the eleven desktop_* tools with model-visible schemas', async () => {
    const { ctx, unload } = await setup()
    const names = ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('desktop_')).sort()
    expect(names).toEqual([
      'desktop_click', 'desktop_find', 'desktop_get', 'desktop_list_apps', 'desktop_list_windows',
      'desktop_press', 'desktop_screenshot', 'desktop_set_value', 'desktop_snapshot', 'desktop_status',
      'desktop_type',
    ])
    for (const schema of ctx.tools.schemas()) {
      if (!schema.name.startsWith('desktop_')) continue
      expect(schema.description.length, schema.name).toBeGreaterThan(40)
    }
    await unload()
  })

  it('unregisters everything when the plugin fiber is disposed (HMR safety)', async () => {
    const { ctx, unload } = await setup()
    expect(ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('desktop_'))).toHaveLength(11)
    await unload()
    // The host services survive; only the plugin's contributions are gone.
    expect(ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('desktop_'))).toHaveLength(0)
  })

  it('desktop_status returns the status data through the pipeline', async () => {
    const { ctx, unload } = await setup()
    const result = await call(ctx, 'desktop_status', {})
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected success')
    expect((result.value as { ok: boolean }).ok).toBe(true)
    expect(resultText(result)).toContain('platform')
    const invocations = await fake!.invocations()
    expect(invocations[0]).toEqual(['status'])
    await unload()
  })

  it('desktop_snapshot passes validated args as exact argv', async () => {
    const { ctx, unload } = await setup()
    await call(ctx, 'desktop_snapshot', { app: 'Finder', interactiveOnly: true, compact: true, maxDepth: 5 })
    const invocations = await fake!.invocations()
    expect(invocations[0]).toEqual([
      'snapshot', '--app', 'Finder', '--interactive-only', '--compact', '--max-depth', '5',
      '--timeout-ms', '1000', // max(1000, observeTimeoutMs - 5000) with the 5s test budget
    ])
    await unload()
  })

  it('desktop_get reads a property by validated ref', async () => {
    const { ctx, unload } = await setup()
    await call(ctx, 'desktop_get', { ref: '@s8f3k2p9:e7', property: 'value' })
    const invocations = await fake!.invocations()
    expect(invocations[0]).toEqual(['get', '@s8f3k2p9:e7', '--property', 'value'])
    await unload()
  })

  it('desktop_screenshot requires exactly one scope and writes under the configured dir', async () => {
    const { ctx, unload } = await setup()
    const both = await call(ctx, 'desktop_screenshot', { app: 'Finder', windowId: 'w-1' })
    expect(both.isError).toBe(true)
    const neither = await call(ctx, 'desktop_screenshot', {})
    expect(neither.isError).toBe(true)
    expect(await fake!.invocations()).toHaveLength(0)
    const ok = await call(ctx, 'desktop_screenshot', { app: 'Finder' })
    expect(ok.isError).toBe(false)
    const invocations = await fake!.invocations()
    expect(invocations[0]!.slice(0, 3)).toEqual(['screenshot', '--app', 'Finder'])
    expect(invocations[0]!.at(-1)).toMatch(/\.png$/)
    await unload()
  })

  it('rejects a malformed ref BEFORE any spawn', async () => {
    const { ctx, unload } = await setup({ approval: 'allowed-once' })
    const result = await call(ctx, 'desktop_click', { ref: '@e8' }, agentWithSession('bad-ref'))
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('qualified ref')
    expect(await fake!.invocations()).toHaveLength(0)
    await unload()
  })

  it('rejects dash-leading app names BEFORE any spawn (flag injection)', async () => {
    const { ctx, unload } = await setup()
    const result = await call(ctx, 'desktop_snapshot', { app: '--headless' })
    expect(result.isError).toBe(true)
    expect(await fake!.invocations()).toHaveLength(0)
    await unload()
  })

  it('rejects over-length text BEFORE any spawn', async () => {
    const { ctx, unload } = await setup({ approval: 'allowed-once', config: { maxTextLength: 10 } })
    const result = await call(ctx, 'desktop_type', { ref: '@s8f3k2p9:e8', text: 'x'.repeat(11) }, agentWithSession('long-text'))
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('maximum length')
    expect(await fake!.invocations()).toHaveLength(0)
    await unload()
  })

  it('rejects an invalid combo BEFORE any spawn', async () => {
    const { ctx, unload } = await setup({ approval: 'allowed-once' })
    const result = await call(ctx, 'desktop_press', { combo: 'banana+c' }, agentWithSession('bad-combo'))
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('modifier')
    expect(await fake!.invocations()).toHaveLength(0)
    await unload()
  })

  it('denies app-scoped observation outside allowedApps (policy, pre-spawn)', async () => {
    const { ctx, unload } = await setup({ config: { allowedApps: ['Finder'] } })
    const result = await call(ctx, 'desktop_snapshot', { app: 'TextEdit' })
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('allowedApps')
    expect(await fake!.invocations()).toHaveLength(0)
    await unload()
  })
})

describe('approval gating of mutating tools', () => {
  it('no approval service mounted: mutating calls fail closed, nothing spawns', async () => {
    const { ctx, unload } = await setup()
    const result = await call(ctx, 'desktop_click', { ref: '@s8f3k2p9:e7' }, agentWithSession('no-approval'))
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('DeskBridge wants to run desktop_click')
    expect(await fake!.invocations()).toHaveLength(0)
    await unload()
  })

  it('approval rejected: the call is denied, nothing spawns', async () => {
    const { ctx, unload } = await setup({ approval: 'rejected' })
    const result = await call(ctx, 'desktop_click', { ref: '@s8f3k2p9:e7' }, agentWithSession('rejected'))
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('rejected')
    expect(await fake!.invocations()).toHaveLength(0)
    await unload()
  })

  it('approval allowed-once: the call executes (argv recorded)', async () => {
    const { ctx, unload } = await setup({ approval: 'allowed-once' })
    const result = await call(ctx, 'desktop_click', { ref: '@s8f3k2p9:e7' }, agentWithSession('allowed'))
    expect(result.isError).toBe(false)
    const invocations = await fake!.invocations()
    expect(invocations[0]).toEqual(['click', '@s8f3k2p9:e7', '--timeout-ms', '5000'])
    await unload()
  })

  it('approval unavailable: fail closed, nothing spawns', async () => {
    const { ctx, unload } = await setup({ approval: 'unavailable' })
    const result = await call(ctx, 'desktop_type', { ref: '@s8f3k2p9:e8', text: 'hi' }, agentWithSession('unavail'))
    expect(result.isError).toBe(true)
    expect(await fake!.invocations()).toHaveLength(0)
    await unload()
  })

  it('observation tools need no approval and run directly', async () => {
    const { ctx, unload } = await setup()
    const result = await call(ctx, 'desktop_status', {}, agentWithSession('observe'))
    expect(result.isError).toBe(false)
    expect(await fake!.invocations()).toHaveLength(1)
    await unload()
  })
})

describe('CLI domain and infrastructure failures through the pipeline', () => {
  it('STALE_REF is a SUCCESSFUL tool result carrying recovery guidance', async () => {
    const { ctx, unload } = await setup({ mode: 'stale-ref', approval: 'allowed-once' })
    const result = await call(ctx, 'desktop_click', { ref: '@s8f3k2p9:e7' }, agentWithSession('stale'))
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected domain-failure-as-value')
    const value = result.value as { ok: boolean; error?: { code: string; requiresFreshSnapshot: boolean; retry: string } }
    expect(value.ok).toBe(false)
    expect(value.error?.code).toBe('STALE_REF')
    expect(value.error?.requiresFreshSnapshot).toBe(true)
    expect(resultText(result)).toContain('STALE_REF')
    expect(resultText(result)).toContain('fresh desktop_snapshot')
    await unload()
  })

  it('PERM_DENIED surfaces the permission suggestion to the model', async () => {
    const { ctx, unload } = await setup({ mode: 'perm-denied', approval: 'allowed-once' })
    const result = await call(ctx, 'desktop_press', { combo: 'cmd+c' }, agentWithSession('perm'))
    expect(result.isError).toBe(false)
    expect(resultText(result)).toContain('PERM_DENIED')
    expect(resultText(result)).toContain('Accessibility permission')
    await unload()
  })

  it('garbage stdout becomes an isError result (infrastructure failure)', async () => {
    const { ctx, unload } = await setup({ mode: 'garbage' })
    const result = await call(ctx, 'desktop_status', {})
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('not a valid JSON envelope')
    await unload()
  })

  it('an unaccepted envelope version is an infrastructure error naming the versions', async () => {
    const { ctx, unload } = await setup({ mode: 'wrong-version' })
    const result = await call(ctx, 'desktop_status', {})
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('9.9')
    await unload()
  })

  it('a crashed CLI (exit 137, no output) is an infrastructure error', async () => {
    const { ctx, unload } = await setup({ mode: 'crash' })
    const result = await call(ctx, 'desktop_status', {})
    expect(result.isError).toBe(true)
    await unload()
  })

  it('an exit-2 INVALID_ARGS envelope parses as a domain failure', async () => {
    const { ctx, unload } = await setup({ mode: 'exit-2' })
    const result = await call(ctx, 'desktop_get', { ref: '@s8f3k2p9:e7', property: 'text' })
    expect(result.isError).toBe(false)
    expect((result.value as { error?: { code: string } }).error?.code).toBe('INVALID_ARGS')
    await unload()
  })
})

describe('timeouts and cancellation', () => {
  it('a hanging CLI is terminated at the outer budget and reported as a timeout error', async () => {
    const { ctx, unload } = await setup({ mode: 'hang', config: { observeTimeoutMs: 700 } })
    const result = await call(ctx, 'desktop_status', {})
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('exceeded its 700 ms budget')
    await unload()
  })

  it('aborting the tool signal cancels the CLI run', async () => {
    const { ctx, unload } = await setup({ mode: 'hang' })
    const controller = new AbortController()
    const pending = call(ctx, 'desktop_status', {}, undefined, controller.signal)
    setTimeout(() => controller.abort(), 300)
    const result = await pending
    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/cancel/i)
    await unload()
  })
})
