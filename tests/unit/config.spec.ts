import { describe, expect, it } from 'vitest'
import { resolveConfig, type Config } from '../../src/config.ts'

function base(override: Partial<Config> = {}): Config {
  return {
    enabled: false,
    command: 'agent-desktop',
    extraArgs: [],
    probeAtStartup: true,
    acceptedEnvelopeVersions: ['2.6'],
    claimComputerUse: true,
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
  }
}

describe('config resolution', () => {
  it('defaults survive a passthrough', () => {
    const resolved = resolveConfig(base())
    expect(resolved.enabled).toBe(false)
    expect(resolved.command).toBe('agent-desktop')
    expect(resolved.acceptedEnvelopeVersions).toEqual(['2.6'])
    expect(resolved.maxTextLength).toBe(1500)
    expect(resolved.screenshotDir).toContain('deskbridge')
  })

  it('clamps non-positive timeouts to safe defaults', () => {
    const resolved = resolveConfig(base({ observeTimeoutMs: 0, interactTimeoutMs: -5, typeTimeoutMs: Number.NaN }))
    expect(resolved.observeTimeoutMs).toBe(20000)
    expect(resolved.interactTimeoutMs).toBe(30000)
    expect(resolved.typeTimeoutMs).toBe(60000)
  })

  it('caps maxTextLength at the CLI hard limit of 10000', () => {
    expect(resolveConfig(base({ maxTextLength: 999999 })).maxTextLength).toBe(10000)
    expect(resolveConfig(base({ maxTextLength: 0 })).maxTextLength).toBe(1500)
  })

  it('falls back to acceptedEnvelopeVersions ["2.6"] when empty', () => {
    expect(resolveConfig(base({ acceptedEnvelopeVersions: [] })).acceptedEnvelopeVersions).toEqual(['2.6'])
  })

  it('keeps an explicit screenshotDir and drops empty extraArgs', () => {
    const resolved = resolveConfig(base({ screenshotDir: '/srv/shots', extraArgs: ['', '--session'] }))
    expect(resolved.screenshotDir).toBe('/srv/shots')
    expect(resolved.extraArgs).toEqual(['--session'])
  })
})
