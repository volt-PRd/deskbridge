/**
 * Input validation before any spawn.
 *
 * Guards user/model-supplied strings so they can never be interpreted as CLI
 * flags (leading `-`) or contain NUL. Refs additionally follow the CLI's own
 * grammar: `@<snapshot_id>:e<N>` where the snapshot id is 3-64 chars of
 * `[A-Za-z0-9_-]` and N is 1-10 digits > 0
 * (`crates/core/src/refs/ref_token.rs:19-53`, `refs/mod.rs:256-267`).
 * Window ids are opaque per-platform strings (`w-<number>` on macOS/Windows,
 * `w-<bus>-<path>` on Linux) with no cross-platform grammar, so only the
 * safety guards apply.
 *
 * @module dsh-deskbridge/validation
 */

import type { AgentDesktopErrorCode } from './adapter/envelope.ts'

/** A rejected input, mirroring the CLI's own `INVALID_ARGS` semantics. */
export class InvalidToolInputError extends Error {
  readonly code: AgentDesktopErrorCode = 'INVALID_ARGS'

  constructor(message: string) {
    super(message)
    this.name = 'InvalidToolInputError'
  }
}

/** Ref grammar: `@<snapshot_id>:e<element>` with the CLI's own bounds. */
const REF_PATTERN = /^@[A-Za-z0-9_-]{3,64}:e[0-9]{1,10}$/

/** A conservative window-id shape covering all three platforms. */
const WINDOW_ID_PATTERN = /^w-[A-Za-z0-9._-]{1,128}$/

/** Property values accepted by `get --property` (`src/dispatch/parse.rs:8-20`). */
const GET_PROPERTIES = ['text', 'value', 'title', 'bounds', 'role', 'states'] as const
export type GetProperty = typeof GET_PROPERTIES[number]

/** Direction values accepted by `scroll --direction`. */
const SCROLL_DIRECTIONS = ['up', 'down', 'left', 'right'] as const
export type ScrollDirection = typeof SCROLL_DIRECTIONS[number]

/** `desktop_set_value` modes — the three ref-action variants this tool covers. */
const SET_VALUE_MODES = ['set-value', 'select', 'clear'] as const
export type SetValueMode = typeof SET_VALUE_MODES[number]

/** Click buttons this plugin exposes. */
const CLICK_BUTTONS = ['left', 'right'] as const
export type ClickButton = typeof CLICK_BUTTONS[number]

/**
 * Reject a string that could be mistaken for a CLI flag or carry NUL.
 * Values that pass become argv elements passed through the subprocess seam
 * (never through a shell), but the leading-dash guard keeps the CLI's own
 * argument parser from reinterpreting them as flags.
 */
function assertSafeValue(value: string, what: string): void {
  if (value.length === 0) throw new InvalidToolInputError(`${what} must not be empty`)
  if (value.startsWith('-')) throw new InvalidToolInputError(`${what} must not start with "-" (got ${JSON.stringify(value.slice(0, 24))})`)
  if (value.includes('\0')) throw new InvalidToolInputError(`${what} must not contain NUL`)
}

/** Validate an application name for `--app`. */
export function validateAppName(app: string): string {
  assertSafeValue(app, 'app')
  if (app.length > 256) throw new InvalidToolInputError(`app name too long (${app.length} > 256 chars)`)
  return app
}

/** Validate a window id for `--window-id`. */
export function validateWindowId(windowId: string): string {
  assertSafeValue(windowId, 'windowId')
  if (!WINDOW_ID_PATTERN.test(windowId)) {
    throw new InvalidToolInputError(`windowId must look like "w-123" or "w-1.7-frame" (got ${JSON.stringify(windowId.slice(0, 24))})`)
  }
  return windowId
}

/** Validate a qualified ref `@<snapshot_id>:e<N>`. */
export function validateRef(ref: string): string {
  if (!REF_PATTERN.test(ref)) {
    throw new InvalidToolInputError(
      `ref must be a qualified ref from a snapshot, shaped "@<snapshot_id>:e<number>" (e.g. "@s8f3k2p9:e7"); got ${JSON.stringify(ref.slice(0, 40))}`,
    )
  }
  return ref
}

/**
 * Validate text for `type` / `set-value` / `select`.
 * The CLI's own hard cap is 10 000 chars (`commands/type_text.rs:10`); the
 * plugin's `maxTextLength` config (default 1500) applies on top and is
 * checked by the tool, not here.
 */
export function validateText(text: string, what: string, maxLength: number): string {
  assertSafeValue(text, what)
  if (text.length > maxLength) {
    throw new InvalidToolInputError(`${what} exceeds the configured maximum length (${text.length} > ${maxLength} chars)`)
  }
  return text
}

/**
 * Validate a `press` combo. Grammar (lowercased, spaces stripped,
 * `+`-separated, last segment is the key):
 * modifiers `meta|cmd|command|super|win|ctrl|control|alt|option|shift`,
 * then any non-empty key token (`crates/core/src/commands/combo.rs:21-64`).
 */
const COMBO_PATTERN = /^[A-Za-z0-9+.\-]{1,64}$/
const MODIFIERS = new Set(['meta', 'cmd', 'command', 'super', 'win', 'ctrl', 'control', 'alt', 'option', 'shift'])

export function validateCombo(combo: string): string {
  assertSafeValue(combo, 'combo')
  if (!COMBO_PATTERN.test(combo)) {
    throw new InvalidToolInputError(`combo may contain only letters, digits, "+", ".", "-" (got ${JSON.stringify(combo.slice(0, 24))})`)
  }
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  if (key === undefined || key.length === 0) {
    throw new InvalidToolInputError('combo must end with a key (e.g. "return", "cmd+c")')
  }
  for (const part of parts.slice(0, -1)) {
    if (part.length === 0) throw new InvalidToolInputError('combo must not contain empty "+" segments')
    if (!MODIFIERS.has(part)) {
      throw new InvalidToolInputError(
        `"${part}" is not a known modifier; valid modifiers: meta, cmd, command, super, win, ctrl, control, alt, option, shift`,
      )
    }
  }
  return combo
}

/** Validate a `get` property enum value. */
export function validateGetProperty(property: string): GetProperty {
  const value = GET_PROPERTIES.find(p => p === property)
  if (value === undefined) {
    throw new InvalidToolInputError(`property must be one of: ${GET_PROPERTIES.join(', ')}`)
  }
  return value
}

/** Validate a scroll direction enum value. */
export function validateScrollDirection(direction: string): ScrollDirection {
  const value = SCROLL_DIRECTIONS.find(d => d === direction)
  if (value === undefined) {
    throw new InvalidToolInputError(`direction must be one of: ${SCROLL_DIRECTIONS.join(', ')}`)
  }
  return value
}

/** Validate a `desktop_set_value` mode enum value. */
export function validateSetValueMode(mode: string): SetValueMode {
  const value = SET_VALUE_MODES.find(m => m === mode)
  if (value === undefined) {
    throw new InvalidToolInputError(`mode must be one of: ${SET_VALUE_MODES.join(', ')}`)
  }
  return value
}

/** Validate a click button enum value. */
export function validateClickButton(button: string): ClickButton {
  const value = CLICK_BUTTONS.find(b => b === button)
  if (value === undefined) {
    throw new InvalidToolInputError(`button must be one of: ${CLICK_BUTTONS.join(', ')}`)
  }
  return value
}

/**
 * Validate a screenshot path generated by the plugin (never model-chosen).
 * Absolute, no parent traversal, extension enforced by the caller.
 */
export function validateScreenshotPath(path: string): string {
  assertSafeValue(path, 'screenshot path')
  if (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) {
    throw new InvalidToolInputError('screenshot path must be absolute')
  }
  const segments = path.split(/[\\/]/)
  if (segments.includes('..')) throw new InvalidToolInputError('screenshot path must not traverse upward')
  return path
}
