/**
 * argv builders: the single place agent-desktop flags are spelled.
 *
 * Every builder returns the argument array AFTER the binary (argv[0] is
 * added by the runner), positional order exactly as the CLI's clap parser
 * defines it (verified against `src/cli_args/*.rs` of agent-desktop v1.0.2):
 * `type <REF> <TEXT>`, `set-value <REF> <VALUE>`, `select <REF> <VALUE>`,
 * `press <COMBO>`, `get <REF>`, `click <REF>`, `screenshot [PATH]`.
 * Inputs must already be validated (`../validation.ts`).
 *
 * @module dsh-deskbridge/adapter/argv
 */

export interface SnapshotArgs {
  readonly app: string
  readonly windowId?: string | undefined
  readonly interactiveOnly?: boolean | undefined
  readonly compact?: boolean | undefined
  readonly skeleton?: boolean | undefined
  readonly maxDepth?: number | undefined
  readonly root?: string | undefined
  readonly timeoutMs?: number | undefined
}

/** `snapshot --app A [--window-id W] [-i] [--compact] [--skeleton] [--max-depth N] [--root REF] [--timeout-ms MS]` */
export function snapshotArgs(args: SnapshotArgs): string[] {
  const out: string[] = ['snapshot', '--app', args.app]
  if (args.windowId !== undefined) out.push('--window-id', args.windowId)
  if (args.interactiveOnly) out.push('--interactive-only')
  if (args.compact) out.push('--compact')
  if (args.skeleton) out.push('--skeleton')
  if (args.maxDepth !== undefined) out.push('--max-depth', String(args.maxDepth))
  if (args.root !== undefined) out.push('--root', args.root)
  if (args.timeoutMs !== undefined) out.push('--timeout-ms', String(args.timeoutMs))
  return out
}

export interface FindArgs {
  readonly app: string
  readonly windowId?: string | undefined
  readonly role?: string | undefined
  readonly name?: string | undefined
  readonly value?: string | undefined
  readonly text?: string | undefined
  readonly description?: string | undefined
  readonly exact?: boolean | undefined
  readonly root?: string | undefined
  readonly first?: boolean | undefined
  readonly limit?: number | undefined
  readonly count?: boolean | undefined
  readonly timeoutMs?: number | undefined
}

/** `find --app A [--role R] [--name N] [--text T] [--exact] [--first|--limit L|--count] [--root REF] [--timeout-ms MS]` */
export function findArgs(args: FindArgs): string[] {
  const out: string[] = ['find', '--app', args.app]
  if (args.windowId !== undefined) out.push('--window-id', args.windowId)
  if (args.role !== undefined) out.push('--role', args.role)
  if (args.name !== undefined) out.push('--name', args.name)
  if (args.value !== undefined) out.push('--value', args.value)
  if (args.text !== undefined) out.push('--text', args.text)
  if (args.description !== undefined) out.push('--description', args.description)
  if (args.exact) out.push('--exact')
  if (args.root !== undefined) out.push('--root', args.root)
  const selectors = [args.first === true, args.limit !== undefined, args.count === true].filter(Boolean).length
  if (selectors > 1) throw new Error('find accepts at most one result-shaping mode (first/limit/count)')
  if (args.first) out.push('--first')
  if (args.limit !== undefined) out.push('--limit', String(args.limit))
  if (args.count) out.push('--count')
  if (args.timeoutMs !== undefined) out.push('--timeout-ms', String(args.timeoutMs))
  return out
}

export interface RefActionArgs {
  readonly ref: string
  readonly timeoutMs?: number | undefined
}

/** `click|right-click|clear|focus|toggle|check|uncheck|expand|collapse|scroll-to <REF> [--timeout-ms MS]` */
export function refActionArgs(command: string, args: RefActionArgs): string[] {
  const out: string[] = [command, args.ref]
  if (args.timeoutMs !== undefined) out.push('--timeout-ms', String(args.timeoutMs))
  return out
}

export interface TypeArgs extends RefActionArgs {
  readonly text: string
  readonly intervalMs?: number | undefined
}

/** `type <REF> <TEXT> [--interval-ms N] [--timeout-ms MS]` — positional order REF then TEXT. */
export function typeArgs(args: TypeArgs): string[] {
  const out: string[] = ['type', args.ref, args.text]
  if (args.intervalMs !== undefined) out.push('--interval-ms', String(args.intervalMs))
  if (args.timeoutMs !== undefined) out.push('--timeout-ms', String(args.timeoutMs))
  return out
}

export interface SetValueArgs extends RefActionArgs {
  readonly value: string
}

/** `set-value <REF> <VALUE> [--timeout-ms MS]` — positional order REF then VALUE. */
export function setValueArgs(args: SetValueArgs): string[] {
  const out: string[] = ['set-value', args.ref, args.value]
  if (args.timeoutMs !== undefined) out.push('--timeout-ms', String(args.timeoutMs))
  return out
}

/** `select <REF> <VALUE> [--timeout-ms MS]` — positional order REF then VALUE. */
export function selectArgs(args: SetValueArgs): string[] {
  const out: string[] = ['select', args.ref, args.value]
  if (args.timeoutMs !== undefined) out.push('--timeout-ms', String(args.timeoutMs))
  return out
}

export interface PressArgs {
  readonly combo: string
  readonly app?: string | undefined
  readonly windowId?: string | undefined
  readonly force?: boolean | undefined
}

/** `press <COMBO> [--app A] [--window-id W] [--force]` */
export function pressArgs(args: PressArgs): string[] {
  const out: string[] = ['press', args.combo]
  if (args.app !== undefined) out.push('--app', args.app)
  if (args.windowId !== undefined) out.push('--window-id', args.windowId)
  if (args.force) out.push('--force')
  return out
}

export interface GetArgs {
  readonly ref: string
  readonly property: string
}

/** `get <REF> --property P` */
export function getArgs(args: GetArgs): string[] {
  return ['get', args.ref, '--property', args.property]
}

export interface ListWindowsArgs {
  readonly app?: string | undefined
  readonly timeoutMs?: number | undefined
}

/** `list-windows [--app A] [--timeout-ms MS]` */
export function listWindowsArgs(args: ListWindowsArgs): string[] {
  const out: string[] = ['list-windows']
  if (args.app !== undefined) out.push('--app', args.app)
  if (args.timeoutMs !== undefined) out.push('--timeout-ms', String(args.timeoutMs))
  return out
}

export interface ScreenshotArgs {
  readonly app?: string | undefined
  readonly windowId?: string | undefined
  readonly path: string
}

/** `screenshot [--app A | --window-id W] <PATH>` — PATH always given: no base64 in logs. */
export function screenshotArgs(args: ScreenshotArgs): string[] {
  const out: string[] = ['screenshot']
  if (args.app !== undefined && args.windowId !== undefined) {
    throw new Error('screenshot accepts at most one scope (--app or --window-id)')
  }
  if (args.app !== undefined) out.push('--app', args.app)
  if (args.windowId !== undefined) out.push('--window-id', args.windowId)
  out.push(args.path)
  return out
}

/** `status` */
export function statusArgs(): string[] {
  return ['status']
}

/** `version` */
export function versionArgs(): string[] {
  return ['version']
}

/** `list-apps [--timeout-ms MS]` */
export function listAppsArgs(timeoutMs?: number | undefined): string[] {
  const out: string[] = ['list-apps']
  if (timeoutMs !== undefined) out.push('--timeout-ms', String(timeoutMs))
  return out
}
