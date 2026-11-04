/**
 * Zod validation of the agent-desktop JSON output contract.
 *
 * agent-desktop v1.0.2 prints exactly one envelope per invocation on stdout
 * (envelope version "2.6"; `crates/core/src/response/output.rs:7-56`):
 *
 *   { "version": "2.6", "ok": true, "command": "<kebab-name>", "data": {...} }
 *   { "version": "2.6", "ok": false, "command": "...", "error": { code, message,
 *     disposition, suggestion?, recovery?, platform_detail?, details? } }
 *
 * `version`, `ok`, `command` are always present; `data`/`error` are omitted
 * when absent; on errors `code`, `message`, `disposition` are always present
 * (`docs/json-output.md`). Exit codes: 0 success, 1 structured error, 2 clap
 * parse error — exit 2 still prints the envelope with `INVALID_ARGS`.
 *
 * Schemas below stay permissive on `data` (typed views are per-command helpers
 * in `./views.ts`) and strict on the fields this bridge branches on.
 *
 * @module dsh-deskbridge/adapter/envelope
 */

import { z } from 'zod'
import { AgentDesktopEnvelopeError } from './errors.ts'
export { AgentDesktopEnvelopeError }

/** Every error code the CLI can emit (`crates/core/src/response/error_code.rs`). */
export const AGENT_DESKTOP_ERROR_CODES = [
  'PERM_DENIED',
  'ELEMENT_NOT_FOUND',
  'APP_NOT_FOUND',
  'ACTION_FAILED',
  'ACTION_NOT_SUPPORTED',
  'STALE_REF',
  'AMBIGUOUS_TARGET',
  'WINDOW_NOT_FOUND',
  'PLATFORM_NOT_SUPPORTED',
  'TIMEOUT',
  'INVALID_ARGS',
  'NOTIFICATION_NOT_FOUND',
  'SNAPSHOT_NOT_FOUND',
  'POLICY_DENIED',
  'APP_UNRESPONSIVE',
  'INTERNAL',
] as const

export type AgentDesktopErrorCode = typeof AGENT_DESKTOP_ERROR_CODES[number]

/** Delivery evidence for a command (`crates/core/src/response/delivery_disposition.rs`). */
export const DELIVERY_VALUES = [
  'unknown',
  'not_delivered',
  'delivery_uncertain',
  'delivered_unverified',
  'delivered_verified',
] as const

/** Retry safety derived from delivery (`docs/json-output.md` "Disposition values"). */
export const RETRY_VALUES = ['unknown', 'safe', 'unsafe'] as const

/** Structured recovery hint, present only when `disposition.retry` is `safe`. */
const recoverySchema = z.object({
  strategy: z.string(),
  retryable: z.boolean(),
  requires_fresh_snapshot: z.boolean().optional(),
  retry_after_ms: z.number().optional(),
}).passthrough()

export type CliRecovery = z.infer<typeof recoverySchema>

const dispositionSchema = z.object({
  delivery: z.enum(DELIVERY_VALUES),
  retry: z.enum(RETRY_VALUES),
})

const errorSchema = z.object({
  code: z.enum(AGENT_DESKTOP_ERROR_CODES),
  message: z.string(),
  disposition: dispositionSchema,
  suggestion: z.string().optional(),
  recovery: recoverySchema.optional(),
  platform_detail: z.string().optional(),
  details: z.unknown().optional(),
})

/** The raw envelope: one JSON object per CLI invocation, exactly on stdout. */
export const envelopeSchema = z.object({
  version: z.string(),
  ok: z.boolean(),
  command: z.string(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
})

export type Envelope = z.infer<typeof envelopeSchema>

/** A validated CLI success: envelope `ok: true` with its `data` payload. */
export interface CliSuccess<D> {
  readonly ok: true
  readonly command: string
  readonly data: D
}

/** A validated CLI domain failure: envelope `ok: false`; NOT a thrown error. */
export interface CliFailure {
  readonly ok: false
  readonly command: string
  readonly code: AgentDesktopErrorCode
  readonly message: string
  readonly suggestion?: string | undefined
  readonly disposition: { readonly delivery: string; readonly retry: 'safe' | 'unsafe' | 'unknown' }
  readonly recovery?: CliRecovery | undefined
  readonly details?: unknown
}

export type CliResult<D> = CliSuccess<D> | CliFailure

/**
 * Parse one stdout buffer as a success envelope with a per-command data view.
 *
 * @param stdout - the CLI's complete stdout (one JSON document + newline).
 * @param command - the command name this envelope must echo (mismatch = corruption).
 * @param acceptedVersions - envelope versions this build understands.
 * @param dataSchema - zod view of the command's `data` payload.
 * @returns the success result; callers branch on `ok` for the failure case.
 * @throws AgentDesktopEnvelopeError for unparseable output, wrong envelope
 *   version, `ok:false` with a malformed error payload, or a `data` payload
 *   that fails the command's view schema.
 */
export function parseSuccess<D>(
  stdout: string,
  command: string,
  acceptedVersions: readonly string[],
  dataSchema: z.ZodType<D>,
): CliSuccess<D> {
  const envelope = parseEnvelope(stdout, command, acceptedVersions)
  if (!envelope.ok) {
    // A domain failure is valid output; the caller decides what to do with it.
    throw new AgentDesktopEnvelopeError(
      `parseSuccess called on a failure envelope (command "${command}", code "${envelope.code}")`,
    )
  }
  const parsed = dataSchema.safeParse(envelope.data)
  if (!parsed.success) {
    throw new AgentDesktopEnvelopeError(
      `agent-desktop "${command}" returned data that fails the expected shape: ${parsed.error.message}`,
    )
  }
  return { ok: true, command, data: parsed.data }
}

/**
 * Parse one stdout buffer as a failure envelope.
 *
 * @param stdout - the CLI's complete stdout.
 * @param command - the command name this envelope must echo.
 * @param acceptedVersions - envelope versions this build understands.
 * @returns the typed failure for the tool's canonical value.
 * @throws AgentDesktopEnvelopeError for unparseable output, a version this
 *   build does not accept, or `ok:true` (not a failure).
 */
export function parseFailure(
  stdout: string,
  command: string,
  acceptedVersions: readonly string[],
): CliFailure {
  const envelope = parseEnvelope(stdout, command, acceptedVersions)
  if (envelope.ok) {
    throw new AgentDesktopEnvelopeError(`parseFailure called on a success envelope (command "${command}")`)
  }
  return envelope
}

/**
 * Parse and validate one envelope, either polarity, against the shared rules.
 * @throws AgentDesktopEnvelopeError for unparseable output, an unaccepted
 *   envelope version, a command mismatch, or a structurally invalid error.
 */
export function parseEnvelope(stdout: string, command: string, acceptedVersions: readonly string[]): CliResult<unknown> {
  let parsed: Envelope
  try {
    parsed = envelopeSchema.parse(JSON.parse(stdout))
  } catch (cause) {
    throw new AgentDesktopEnvelopeError(
      `agent-desktop "${command}" produced output that is not a valid JSON envelope: ${String(stdout).slice(0, 400)}`,
      { cause },
    )
  }
  if (parsed.command !== command) {
    throw new AgentDesktopEnvelopeError(
      `agent-desktop envelope command mismatch: expected "${command}", got "${parsed.command}"`,
    )
  }
  if (!acceptedVersions.includes(parsed.version)) {
    throw new AgentDesktopEnvelopeError(
      `agent-desktop envelope version "${parsed.version}" is not accepted by this build of DeskBridge ` +
      `(accepted: ${acceptedVersions.join(', ')}). The CLI and the plugin may be out of date relative to each other.`,
    )
  }
  if (parsed.ok) {
    return { ok: true, command, data: parsed.data }
  }
  const error = parsed.error
  if (error === undefined) {
    throw new AgentDesktopEnvelopeError(`agent-desktop "${command}" returned ok:false without an error payload`)
  }
  return {
    ok: false,
    command,
    code: error.code,
    message: error.message,
    suggestion: error.suggestion,
    disposition: { delivery: error.disposition.delivery, retry: error.disposition.retry },
    recovery: error.recovery,
    details: error.details,
  }
}
