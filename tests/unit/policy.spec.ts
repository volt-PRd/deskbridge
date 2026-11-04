import { describe, expect, it } from 'vitest'
import { decidePreExecute, TOOL_NAMES } from '../../src/policy.ts'
import { resolveConfig, type Config } from '../../src/config.ts'

function config(override: Partial<Config> = {}) {
  return resolveConfig({
    enabled: true,
    command: 'agent-desktop',
    extraArgs: [],
    probeAtStartup: true,
    acceptedEnvelopeVersions: ['2.6'],
    claimComputerUse: false,
    confirmMutating: true,
    allowedApps: [],
    observeTimeoutMs: 20000,
    interactTimeoutMs: 30000,
    typeTimeoutMs: 60000,
    maxTextLength: 1500,
    maxEnvelopeBytes: 8388608,
    screenshotDir: '',
    verboseLogging: false,
    ...override,
  })
}

describe('policy gate decision function', () => {
  it('exposes exactly the eleven tool names', () => {
    expect(TOOL_NAMES).toHaveLength(11)
    expect([...TOOL_NAMES].sort()).toEqual([
      'desktop_click', 'desktop_find', 'desktop_get', 'desktop_list_apps', 'desktop_list_windows',
      'desktop_press', 'desktop_screenshot', 'desktop_set_value', 'desktop_snapshot', 'desktop_status',
      'desktop_type',
    ])
  })

  it('asks for every mutating tool and passes observation through', () => {
    for (const tool of ['desktop_click', 'desktop_type', 'desktop_press', 'desktop_set_value']) {
      const decision = decidePreExecute(tool, { ref: '@s:e1' }, config())
      expect(decision, tool).toEqual({
        kind: 'ask',
        reason: expect.stringContaining(tool),
      })
    }
    for (const tool of ['desktop_status', 'desktop_list_apps', 'desktop_list_windows', 'desktop_snapshot', 'desktop_find', 'desktop_get', 'desktop_screenshot']) {
      expect(decidePreExecute(tool, { app: 'Finder' }, config()), tool).toBe('pass')
    }
  })

  it('passes mutating tools through when confirmMutating is false', () => {
    expect(decidePreExecute('desktop_click', { ref: '@s:e1' }, config({ confirmMutating: false }))).toBe('pass')
  })

  it('denies app-scoped observation outside allowedApps', () => {
    const cfg = config({ allowedApps: ['Finder'] })
    const denied = decidePreExecute('desktop_snapshot', { app: 'TextEdit' }, cfg)
    expect(denied).toEqual({ kind: 'deny', reason: expect.stringContaining('allowedApps') })
    expect(decidePreExecute('desktop_snapshot', { app: 'Finder' }, cfg)).toBe('pass')
    expect(decidePreExecute('desktop_find', { app: 'TextEdit' }, cfg)).toEqual({ kind: 'deny', reason: expect.stringContaining('allowedApps') })
    expect(decidePreExecute('desktop_status', {}, cfg)).toBe('pass')
    // app omitted (optional on screenshot): no allowlist check applies
    expect(decidePreExecute('desktop_screenshot', { windowId: 'w-1' }, cfg)).toBe('pass')
  })

  it('does not gate tools it does not own', () => {
    expect(decidePreExecute('bash', { command: 'ls' }, config())).toBe('pass')
    expect(decidePreExecute('read_file', { path: '/x' }, config())).toBe('pass')
  })

  it('handles non-object arguments defensively', () => {
    expect(decidePreExecute('desktop_snapshot', null, config())).toBe('pass')
    expect(decidePreExecute('desktop_snapshot', 'string', config())).toBe('pass')
  })
})
