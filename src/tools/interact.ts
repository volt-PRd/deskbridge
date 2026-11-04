/**
 * Interaction tools: desktop_click, desktop_type, desktop_press,
 * desktop_set_value. These mutate the desktop and are approval-gated by
 * src/policy.ts; they run exclusively (never in parallel groups).
 *
 * @module dsh-deskbridge/tools/interact
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { AgentDesktopCli } from '../adapter/cli.ts'
import { pressArgs, refActionArgs, selectArgs, setValueArgs, typeArgs } from '../adapter/argv.ts'
import type { ResolvedConfig } from '../config.ts'
import {
  validateAppName,
  validateClickButton,
  validateCombo,
  validateRef,
  validateSetValueMode,
  validateText,
  validateWindowId,
} from '../validation.ts'
import { renderResult, resultValue } from './shared.ts'

/** Inner CLI timeout for ref resolution/actionability (CLI default 5000). */
const INNER_ACTION_TIMEOUT_MS = 5000

/** Build the four interaction tools bound to one CLI adapter. */
export function defineInteractionTools(cli: AgentDesktopCli, config: ResolvedConfig) {
  const desktopClick = defineTool({
    name: 'desktop_click',
    description:
      'Click a desktop UI element by its ref from a recent snapshot (left button by default; right for context ' +
      'menus). The click is delivered through the accessibility API (headless) where the platform supports it. ' +
      'After clicking, verify with a fresh desktop_snapshot or desktop_get when the outcome matters.',
    parameters: {
      ref: { type: 'string', required: true, description: 'Qualified ref from a snapshot (e.g. "@s8f3k2p9:e7")' },
      button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button (default left)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderResult(value, 'Click result follows.'),
    },
    timeoutMs: config.interactTimeoutMs + 5000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ref = validateRef(args.ref)
      const button = validateClickButton(args.button ?? 'left')
      const command = button === 'right' ? 'right-click' : 'click'
      const result = await cli.run(command, refActionArgs(command, { ref, timeoutMs: INNER_ACTION_TIMEOUT_MS }), {
        timeoutMs: config.interactTimeoutMs,
        signal: exec.signal,
      })
      return resultValue(result)
    },
  })

  const desktopType = defineTool({
    name: 'desktop_type',
    description:
      'Type text into a desktop UI element by its ref from a recent snapshot. Prefer desktop_set_value for form ' +
      'fields (atomic value write, more reliable); use this for free text where typing semantics matter. On Windows ' +
      'a headless type is refused (POLICY_DENIED) — use desktop_set_value instead there.',
    parameters: {
      ref: { type: 'string', required: true, description: 'Qualified ref from a snapshot (e.g. "@s8f3k2p9:e7")' },
      text: { type: 'string', required: true, description: 'Text to type' },
      intervalMs: { type: 'integer', description: 'Type one keystroke every N ms (1-2000) instead of inserting at once' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderResult(value, 'Typing result follows.'),
    },
    timeoutMs: config.typeTimeoutMs + 10000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ref = validateRef(args.ref)
      const text = validateText(args.text, 'text', config.maxTextLength)
      const intervalMs = args.intervalMs === undefined ? undefined : Math.min(Math.max(1, args.intervalMs), 2000)
      // Outer budget must cover the CLI's own typing time (30 ms/char + 5 s base).
      const outerMs = Math.max(config.typeTimeoutMs, 6000 + text.length * 35)
      const result = await cli.run('type', typeArgs({ ref, text, intervalMs, timeoutMs: 0 }), {
        timeoutMs: outerMs,
        signal: exec.signal,
      })
      return resultValue(result)
    },
  })

  const desktopPress = defineTool({
    name: 'desktop_press',
    description:
      'Send a key combo to an application: e.g. "return", "escape", "cmd+c", "ctrl+shift+t", "tab". Modifiers: ' +
      'meta, cmd, command, super, win, ctrl, control, alt, option, shift. Some dangerous system shortcuts (e.g. ' +
      'cmd+q, alt+f4) are blocked by the CLI and return POLICY_DENIED; treat that as expected behavior, not an error.',
    parameters: {
      combo: { type: 'string', required: true, description: 'Key combo: "return", "escape", "cmd+c", "shift+tab" ...' },
      app: { type: 'string', description: 'Application name receiving the keys' },
      windowId: { type: 'string', description: 'Target the app instance owning this window' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderResult(value, 'Keypress result follows.'),
    },
    timeoutMs: config.interactTimeoutMs + 5000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const combo = validateCombo(args.combo)
      const app = args.app === undefined ? undefined : validateAppName(args.app)
      const windowId = args.windowId === undefined ? undefined : validateWindowId(args.windowId)
      const result = await cli.run('press', pressArgs({ combo, app, windowId }), {
        timeoutMs: config.interactTimeoutMs,
        signal: exec.signal,
      })
      return resultValue(result)
    },
  })

  const desktopSetValue = defineTool({
    name: 'desktop_set_value',
    description:
      'Set, select, or clear the value of a desktop UI element by its ref: set-value writes a value atomically ' +
      '(works headless on all platforms — the preferred way to fill inputs), select chooses an option, clear ' +
      'empties the element. Verify with desktop_get (property "value" or "states") when the outcome matters.',
    parameters: {
      ref: { type: 'string', required: true, description: 'Qualified ref from a snapshot (e.g. "@s8f3k2p9:e7")' },
      mode: {
        type: 'string',
        required: true,
        enum: ['set-value', 'select', 'clear'],
        description: 'Value operation: set-value (write), select (choose option), clear (empty)',
      },
      value: { type: 'string', description: 'Value to write or option to select (required for set-value and select)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderResult(value, 'Set-value result follows.'),
    },
    timeoutMs: config.interactTimeoutMs + 5000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ref = validateRef(args.ref)
      const mode = validateSetValueMode(args.mode)
      if (mode !== 'clear' && args.value === undefined) {
        throw new Error(`value is required for mode "${mode}"`)
      }
      const value = args.value === undefined ? undefined : validateText(args.value, 'value', config.maxTextLength)
      const common = { ref, timeoutMs: INNER_ACTION_TIMEOUT_MS }
      const argv = mode === 'clear'
        ? refActionArgs('clear', common)
        : mode === 'select'
          ? selectArgs({ ...common, value: value as string })
          : setValueArgs({ ...common, value: value as string })
      const result = await cli.run(mode, argv, {
        timeoutMs: config.interactTimeoutMs,
        signal: exec.signal,
      })
      return resultValue(result)
    },
  })

  return { desktopClick, desktopType, desktopPress, desktopSetValue }
}
