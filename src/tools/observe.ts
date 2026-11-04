/**
 * Observation tools: desktop_status, desktop_list_apps, desktop_list_windows,
 * desktop_snapshot, desktop_find, desktop_get, desktop_screenshot.
 * Read-only with respect to the desktop; safe to run in parallel.
 *
 * @module dsh-deskbridge/tools/observe
 */

import { mkdtemp, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { AgentDesktopCli } from '../adapter/cli.ts'
import { listAppsData, listWindowsData, snapshotData, findData, getData, screenshotData } from '../adapter/views.ts'
import { findArgs, getArgs, listAppsArgs, listWindowsArgs, screenshotArgs, snapshotArgs } from '../adapter/argv.ts'
import type { ResolvedConfig } from '../config.ts'
import {
  validateAppName,
  validateGetProperty,
  validateRef,
  validateScreenshotPath,
  validateWindowId,
} from '../validation.ts'
import { renderResult, resultValue } from './shared.ts'

/** Build the seven observation tools bound to one CLI adapter. */
export function defineObservationTools(cli: AgentDesktopCli, config: ResolvedConfig) {
  const desktopStatus = defineTool({
    name: 'desktop_status',
    description:
      'Report the desktop automation backend status: CLI version, platform, OS permissions ' +
      '(accessibility, screen recording), supported surfaces, and the latest snapshot reference counts. ' +
      'Read-only; use it first when desktop commands fail or return permission errors.',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderResult(value, 'Desktop backend status follows.'),
    },
    timeoutMs: config.observeTimeoutMs + 5000,
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const result = await cli.run('status', ['status'], { timeoutMs: config.observeTimeoutMs, signal: exec.signal })
      return resultValue(result)
    },
  })

  const desktopListApps = defineTool({
    name: 'desktop_list_apps',
    description:
      'List the GUI applications currently running, with names, process ids, and optional bundle ids. ' +
      'Use an app name from this list for snapshot/find/window commands. Read-only.',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderResult(value, 'Running applications follow.'),
    },
    timeoutMs: config.observeTimeoutMs + 5000,
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const result = await cli.run('list-apps', listAppsArgs(config.observeTimeoutMs), {
        timeoutMs: config.observeTimeoutMs,
        signal: exec.signal,
      })
      return resultValue(result)
    },
  })

  const desktopListWindows = defineTool({
    name: 'desktop_list_windows',
    description:
      'List currently open desktop windows, optionally filtered by application. Each window carries an id ' +
      '(for the windowId parameter), title, owning app, and focus state. Read-only.',
    parameters: {
      app: { type: 'string', required: true, description: 'Application name (from desktop_list_apps) to filter windows by' },
    },
    output: {
      schema: { type: 'json' },
      render: (args, value) => renderResult(value, `Windows of ${String(args.app)} follow.`),
    },
    timeoutMs: config.observeTimeoutMs + 5000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const app = validateAppName(args.app)
      const result = await cli.run('list-windows', listWindowsArgs({ app, timeoutMs: config.observeTimeoutMs }), {
        timeoutMs: config.observeTimeoutMs,
        signal: exec.signal,
      })
      return resultValue(result)
    },
  })

  const desktopSnapshot = defineTool({
    name: 'desktop_snapshot',
    description:
      'Capture the accessibility tree of an application window as JSON. Every interactive element carries a ref ' +
      '("@<snapshot_id>:e<number>") you can act on with desktop_click/desktop_type/desktop_set_value. ' +
      'Defaults trim the tree to interactive elements and compact single-child chains; use skeleton for a shallow ' +
      'overview of dense apps, and root to drill into one element\'s subtree from an earlier snapshot. Read-only.',
    parameters: {
      app: { type: 'string', required: true, description: 'Application name (from desktop_list_apps)' },
      windowId: { type: 'string', description: 'Window id from desktop_list_windows, when the app has several windows' },
      interactiveOnly: { type: 'boolean', description: 'Include interactive elements only (default true)' },
      compact: { type: 'boolean', description: 'Collapse single-child unnamed nodes (default true)' },
      skeleton: { type: 'boolean', description: 'Shallow overview with children_count on truncated containers' },
      maxDepth: { type: 'integer', description: 'Maximum tree depth (CLI default 10)' },
      root: { type: 'string', description: 'Ref from a previous snapshot: traverse only its subtree' },
    },
    output: {
      schema: { type: 'json' },
      render: (args, value) => renderResult(value, `Snapshot of ${String(args.app)} follows.`),
    },
    timeoutMs: config.observeTimeoutMs + 5000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const app = validateAppName(args.app)
      const windowId = args.windowId === undefined ? undefined : validateWindowId(args.windowId)
      const root = args.root === undefined ? undefined : validateRef(args.root)
      const argv = snapshotArgs({
        app,
        windowId,
        interactiveOnly: args.interactiveOnly ?? true,
        compact: args.compact ?? true,
        skeleton: args.skeleton,
        maxDepth: args.maxDepth,
        root,
        timeoutMs: Math.max(1000, config.observeTimeoutMs - 5000),
      })
      const result = await cli.run('snapshot', argv, { timeoutMs: config.observeTimeoutMs, signal: exec.signal })
      return resultValue(result)
    },
  })

  const desktopFind = defineTool({
    name: 'desktop_find',
    description:
      'Search an application\'s accessibility tree by role, name, value, or contained text — cheaper than a full ' +
      'snapshot when you know what you are looking for. Matches carry refs you can act on (match objects without a ' +
      'ref are readable text, not action targets). Use first:true to get a single best match or limit to bound results.',
    parameters: {
      app: { type: 'string', required: true, description: 'Application name (from desktop_list_apps)' },
      windowId: { type: 'string', description: 'Window id from desktop_list_windows' },
      role: { type: 'string', description: 'Element role to match (e.g. button, textfield, checkbox); case-insensitive' },
      name: { type: 'string', description: 'Accessible name to match (fuzzy; add exact for equality)' },
      value: { type: 'string', description: 'Element value to match' },
      text: { type: 'string', description: 'Contained text to match (also matches ancestors containing it)' },
      description: { type: 'string', description: 'Element description to match' },
      exact: { type: 'boolean', description: 'Case-insensitive equality instead of fuzzy matching' },
      root: { type: 'string', description: 'Ref from a previous snapshot: search only its subtree' },
      first: { type: 'boolean', description: 'Return only the first match' },
      limit: { type: 'integer', description: 'Return at most N matches (CLI default 50, 0 = all)' },
      count: { type: 'boolean', description: 'Return only a match count' },
    },
    output: {
      schema: { type: 'json' },
      render: (args, value) => renderResult(value, `Find results in ${String(args.app)} follow.`),
    },
    timeoutMs: config.observeTimeoutMs + 5000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const app = validateAppName(args.app)
      const windowId = args.windowId === undefined ? undefined : validateWindowId(args.windowId)
      const root = args.root === undefined ? undefined : validateRef(args.root)
      const selectors = [args.first === true, args.limit !== undefined, args.count === true].filter(Boolean).length
      if (selectors > 1) {
        throw new Error('use at most one of first, limit, count')
      }
      const argv = findArgs({
        app,
        windowId,
        role: args.role,
        name: args.name,
        value: args.value,
        text: args.text,
        description: args.description,
        exact: args.exact,
        root,
        first: args.first,
        limit: args.limit,
        count: args.count,
        timeoutMs: Math.max(1000, config.observeTimeoutMs - 5000),
      })
      const result = await cli.run('find', argv, { timeoutMs: config.observeTimeoutMs, signal: exec.signal })
      return resultValue(result)
    },
  })

  const desktopGet = defineTool({
    name: 'desktop_get',
    description:
      'Read one property of an element by its ref from a recent snapshot: text (default), value, title, bounds, ' +
      'role, or states. Read-only; use it to check an element\'s current state after an action.',
    parameters: {
      ref: { type: 'string', required: true, description: 'Qualified ref from a snapshot (e.g. "@s8f3k2p9:e7")' },
      property: {
        type: 'string',
        required: true,
        enum: ['text', 'value', 'title', 'bounds', 'role', 'states'],
        description: 'Property to read',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderResult(value, 'Element property follows.'),
    },
    timeoutMs: config.observeTimeoutMs + 5000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const ref = validateRef(args.ref)
      const property = validateGetProperty(args.property)
      const result = await cli.run('get', getArgs({ ref, property }), {
        timeoutMs: config.observeTimeoutMs,
        signal: exec.signal,
      })
      return resultValue(result)
    },
  })

  const desktopScreenshot = defineTool({
    name: 'desktop_screenshot',
    description:
      'Capture a screenshot of an application window (or a specific window) to a file and return its path and ' +
      'dimensions. The path is chosen by the plugin; view the image through the harness image-reading tool. ' +
      'Screen-recording permission may be required (see desktop_status).',
    parameters: {
      app: { type: 'string', description: 'Application name to capture (either app or windowId)' },
      windowId: { type: 'string', description: 'Window id to capture (either app or windowId)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderResult(value, 'Screenshot saved; metadata follows.'),
    },
    timeoutMs: config.observeTimeoutMs + 10000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if ((args.app === undefined) === (args.windowId === undefined)) {
        throw new Error('provide exactly one of app or windowId')
      }
      const app = args.app === undefined ? undefined : validateAppName(args.app)
      const windowId = args.windowId === undefined ? undefined : validateWindowId(args.windowId)
      await mkdir(config.screenshotDir, { recursive: true })
      const dir = await mkdtemp(join(config.screenshotDir, 'shot-'))
      const path = validateScreenshotPath(join(dir, `screen-${randomBytes(4).toString('hex')}.png`))
      const result = await cli.run('screenshot', screenshotArgs({ app, windowId, path }), {
        timeoutMs: config.observeTimeoutMs + 10000,
        signal: exec.signal,
      })
      return resultValue(result)
    },
  })

  return { desktopStatus, desktopListApps, desktopListWindows, desktopSnapshot, desktopFind, desktopGet, desktopScreenshot }
}

// Re-export zod views for consumers that want typed data access.
export { listAppsData, listWindowsData, snapshotData, findData, getData, screenshotData }
