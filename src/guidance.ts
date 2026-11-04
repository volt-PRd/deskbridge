/**
 * The system-prompt section teaching the model the agent-desktop loop.
 * Registered at the `TOOL_COMPUTER_USE` position (3000), the same slot DSH's
 * own CUA provider uses (`packages/experimental/cua/src/index.ts:326`).
 *
 * @module dsh-deskbridge/guidance
 */

import type { Context } from '@deepseek-ai/cordis'

/** Section name; duplicate registrations throw, so one per plugin instance. */
export const GUIDANCE_SECTION_NAME = 'computer-use:deskbridge'

/** The guidance text (static — no assembly-time variability yet). */
export const GUIDANCE_TEXT = [
  '## Desktop tools (agent-desktop)',
  '',
  'You can read and operate desktop applications through the accessibility tree. The workflow is observe, act, verify:',
  '',
  '1. `desktop_list_apps` to find the application, `desktop_list_windows` when several windows are open.',
  '2. Locate elements: `desktop_find` (cheap, scoped search by role/name) or `desktop_snapshot` for the interactive tree. Refs look like `@s8f3k2p9:e7` and belong to the snapshot that issued them.',
  '3. Act on a ref: `desktop_click`, `desktop_type`, `desktop_set_value` (preferred for form fields — atomic), `desktop_press` for keys.',
  '4. Verify: take a fresh `desktop_snapshot`/`desktop_find` and check the state changed as intended.',
  '',
  'Rules:',
  '- A `STALE_REF`, `AMBIGUOUS_TARGET`, or `SNAPSHOT_NOT_FOUND` error means the ref is dead: take a fresh snapshot and use the new ref. Never repeat the action with the stale ref.',
  '- Every action result carries `retry` safety. When retry is not "safe", the action may have partially happened — observe before trying anything else. Never blindly re-run failed actions.',
  '- `desktop_screenshot` writes an image file; use the harness read_image tool to view it when you need pixels.',
  '- Mutating actions require user approval and may be denied; do not retry a denied action in the same turn.',
  '- Prefer `desktop_set_value` over `desktop_type` for inputs, and `desktop_find` over full snapshots when you know what you are looking for.',
].join('\n')

/**
 * Register the guidance section at the computer-use position.
 * @param ctx - the plugin context (effect-disposed on unload).
 * @returns the disposer.
 */
export function registerGuidance(ctx: Context): () => void {
  return ctx.systemPrompt.section({
    name: GUIDANCE_SECTION_NAME,
    order: ctx.systemPrompt.getSectionOrder('TOOL_COMPUTER_USE'),
    text: GUIDANCE_TEXT,
    interpolate: false,
  })
}
