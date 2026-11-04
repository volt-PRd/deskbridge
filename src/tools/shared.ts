/**
 * Shared plumbing for the DeskBridge tools: canonical-value construction and
 * model-facing rendering for every CLI outcome.
 *
 * Canonical values follow the dsh cookbook rule: a successful tool call
 * returns a domain value even when the CLI answered `ok:false` (stale refs,
 * missing permissions), because the model must act on those; only
 * infrastructure failures throw (isError).
 *
 * @module dsh-deskbridge/tools/shared
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { CliFailure, CliResult, CliSuccess } from '../adapter/envelope.ts'

/**
 * The canonical value every DeskBridge tool returns. Fields are conditionally
 * spread in (never `undefined`) so the type satisfies `JsonValue`'s strict
 * index signature.
 */
export type DesktopToolValue = {
  readonly ok: boolean
  readonly command: string
  readonly data?: JsonValue
  readonly error?: {
    readonly code: string
    readonly message: string
    readonly suggestion: string
    readonly retry: string
    readonly delivery: string
    readonly requiresFreshSnapshot: boolean
  }
}

/** Map a validated CLI success to the canonical value. */
export function successValue(result: CliSuccess<unknown>): DesktopToolValue {
  return { ok: true, command: result.command, data: result.data as JsonValue }
}

/** Map a validated CLI failure to the canonical value (NOT a throw). */
export function failureValue(result: CliFailure): DesktopToolValue {
  return {
    ok: false,
    command: result.command,
    error: {
      code: result.code,
      message: result.message,
      suggestion: result.suggestion ?? '',
      retry: result.disposition.retry,
      delivery: result.disposition.delivery,
      requiresFreshSnapshot: result.recovery?.requires_fresh_snapshot === true,
    },
  }
}

/** Map any CLI result to the canonical value. */
export function resultValue(result: CliResult<unknown>): DesktopToolValue {
  return result.ok ? successValue(result) : failureValue(result)
}

function text(text: string): ContentBlock {
  return { type: 'text', text }
}

/**
 * Render a success canonical value for the model.
 * `summary` is a short human line; the full data JSON follows when present
 * and not already embedded in the summary. The `value` parameter is the
 * registry-validated canonical value (`JsonValue` from the json output
 * schema), narrowed back to our shape.
 */
export function renderSuccess(value: unknown, summary: string, includeData = true): ContentBlock[] {
  const blocks = [text(summary)]
  const data = (value as DesktopToolValue).data
  if (includeData && data !== undefined) {
    blocks.push(text(JSON.stringify(data, null, 2)))
  }
  return blocks
}

/**
 * Render a failure canonical value for the model: code, message, retry
 * safety, the upstream suggestion, and the re-snapshot instruction when the
 * failure says refs went stale.
 */
export function renderFailure(value: unknown): ContentBlock[] {
  const error = (value as DesktopToolValue).error
  if (error === undefined) return [text('Desktop command failed.')]
  const lines = [
    `Desktop command "${(value as DesktopToolValue).command}" failed: ${error.code} — ${error.message}`,
    `Delivery: ${error.delivery}; retry: ${error.retry}.`,
  ]
  if (error.suggestion !== undefined) lines.push(error.suggestion)
  if (error.requiresFreshSnapshot === true) {
    lines.push('Take a fresh desktop_snapshot and use the new refs; do not repeat the action with the stale ref.')
  }
  if (error.retry !== 'safe') {
    lines.push('This action may have partially happened; check the current state before trying anything else.')
  }
  return [text(lines.join(' '))]
}

/** Render either polarity. */
export function renderResult(value: unknown, summary: string, includeData = true): ContentBlock[] {
  return (value as DesktopToolValue).ok ? renderSuccess(value, summary, includeData) : renderFailure(value)
}

/** True when the call may join a parallel group: observation only, never mutation. */
export function observeOnlyConcurrency(): boolean {
  return true
}
