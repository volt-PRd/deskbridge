import { describe, expect, it } from 'vitest'
import {
  AGENT_DESKTOP_ERROR_CODES,
  AgentDesktopEnvelopeError,
  parseEnvelope,
  parseFailure,
  parseSuccess,
} from '../../src/adapter/envelope.ts'
import { versionData } from '../../src/adapter/views.ts'

const OK_VERSION = JSON.stringify({
  version: '2.6',
  ok: true,
  command: 'version',
  data: { version: '1.0.2', target: 'x86_64', os: 'linux' },
})

const STALE = JSON.stringify({
  version: '2.6',
  ok: false,
  command: 'click',
  error: {
    code: 'STALE_REF',
    message: '@s8f3k2p9:e7 not found in current RefMap',
    suggestion: 'Re-run a snapshot to obtain fresh refs, then retry with the new ref',
    recovery: { strategy: 'refresh_snapshot_then_retry_original', retryable: true, requires_fresh_snapshot: true },
    disposition: { delivery: 'not_delivered', retry: 'safe' },
  },
})

describe('envelope parsing', () => {
  it('parses a success envelope with a data view', () => {
    const result = parseSuccess(OK_VERSION + '\n', 'version', ['2.6'], versionData)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.version).toBe('1.0.2')
  })

  it('parses a failure envelope with code, disposition, recovery', () => {
    const failure = parseFailure(STALE, 'click', ['2.6'])
    expect(failure.ok).toBe(false)
    expect(failure.code).toBe('STALE_REF')
    expect(failure.disposition.retry).toBe('safe')
    expect(failure.recovery?.requires_fresh_snapshot).toBe(true)
    expect(failure.suggestion).toContain('snapshot')
  })

  it('accepts every one of the 16 documented error codes', () => {
    for (const code of AGENT_DESKTOP_ERROR_CODES) {
      const json = JSON.stringify({
        version: '2.6',
        ok: false,
        command: 'status',
        error: { code, message: 'x', disposition: { delivery: 'unknown', retry: 'unknown' } },
      })
      const failure = parseFailure(json, 'status', ['2.6'])
      expect(failure.code).toBe(code)
    }
  })

  it('rejects an unaccepted envelope version', () => {
    const json = JSON.stringify({ version: '9.9', ok: true, command: 'version', data: {} })
    expect(() => parseEnvelope(json, 'version', ['2.6'])).toThrow(AgentDesktopEnvelopeError)
    expect(() => parseEnvelope(json, 'version', ['2.6'])).toThrow(/9\.9/)
  })

  it('rejects a command mismatch', () => {
    expect(() => parseEnvelope(OK_VERSION, 'status', ['2.6'])).toThrow(/command mismatch/)
  })

  it('rejects non-JSON stdout', () => {
    expect(() => parseEnvelope('not json\n', 'version', ['2.6'])).toThrow(AgentDesktopEnvelopeError)
  })

  it('rejects empty stdout', () => {
    expect(() => parseEnvelope('', 'version', ['2.6'])).toThrow(AgentDesktopEnvelopeError)
  })

  it('rejects ok:false without an error payload', () => {
    const json = JSON.stringify({ version: '2.6', ok: false, command: 'click' })
    expect(() => parseEnvelope(json, 'click', ['2.6'])).toThrow(/without an error payload/)
  })

  it('rejects an unknown error code', () => {
    const json = JSON.stringify({
      version: '2.6',
      ok: false,
      command: 'click',
      error: { code: 'SOMETHING_ELSE', message: 'x', disposition: { delivery: 'unknown', retry: 'unknown' } },
    })
    expect(() => parseEnvelope(json, 'click', ['2.6'])).toThrow(AgentDesktopEnvelopeError)
  })

  it('rejects data failing the command view (exit-2 style INVALID_ARGS still parses)', () => {
    const invalid = JSON.stringify({ version: '2.6', ok: true, command: 'version', data: { version: 42 } })
    expect(() => parseSuccess(invalid, 'version', ['2.6'], versionData)).toThrow(/expected shape/)
    const exitTwo = JSON.stringify({
      version: '2.6',
      ok: false,
      command: 'get',
      error: { code: 'INVALID_ARGS', message: 'unexpected argument', disposition: { delivery: 'not_delivered', retry: 'safe' } },
    })
    expect(parseFailure(exitTwo, 'get', ['2.6']).code).toBe('INVALID_ARGS')
  })

  it('treats a truncated-json stdout as an envelope error, not a crash', () => {
    expect(() => parseEnvelope(OK_VERSION.slice(0, 30), 'version', ['2.6'])).toThrow(AgentDesktopEnvelopeError)
  })
})
