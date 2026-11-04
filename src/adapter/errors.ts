/**
 * Structured infrastructure errors for the agent-desktop subprocess adapter.
 *
 * Domain failures (the CLI answered with `ok: false`) are NOT errors here:
 * they travel through tool canonical values so the model can act on them
 * (dsh cookbook: "Represent a successful domain outcome in the canonical value
 * even when its Native renderer explains a non-ideal state"). Only failures of
 * the bridge itself — missing binary, unusable output, timeouts, aborts —
 * throw, so they surface as `isError` tool results.
 *
 * @module dsh-deskbridge/adapter/errors
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/** The `agent-desktop` executable could not be found or refused to start. */
export class AgentDesktopUnavailableError extends HarnessError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'DESKBRIDGE_CLI_UNAVAILABLE', options)
  }
}

/**
 * The CLI produced output that does not satisfy the JSON envelope contract
 * (unparseable stdout, wrong envelope `version`, missing mandatory fields).
 */
export class AgentDesktopEnvelopeError extends HarnessError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'DESKBRIDGE_ENVELOPE_INVALID', options)
  }
}

/** The outer execution budget elapsed before the CLI settled. */
export class AgentDesktopTimeoutError extends HarnessError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'DESKBRIDGE_TIMEOUT', options)
  }
}

/** The tool call was aborted through `exec.signal` before completion. */
export class AgentDesktopAbortedError extends HarnessError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'DESKBRIDGE_ABORTED', options)
  }
}
