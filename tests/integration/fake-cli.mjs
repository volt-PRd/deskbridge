#!/usr/bin/env node
// Fake agent-desktop CLI for deterministic DeskBridge tests.
//
// Emits the verified envelope contract (version 2.6) on stdout, one JSON line
// per invocation. Behavior is driven by the FAKE_CLI_MODE environment
// variable and the argv it inspects; every invocation appends its argv JSON
// to the file in FAKE_CLI_LOG so tests can assert exactly what was spawned.
//
// Modes:
//   ok            — reply with a per-command canned success data payload
//   stale-ref     — reply with the documented STALE_REF failure envelope
//   perm-denied   — reply with PERM_DENIED
//   hang          — sleep 30s (timeout tests); honors SIGTERM promptly
//   garbage       — print non-JSON
//   wrong-version — print an envelope with version "9.9"
//   exit-2        — print an INVALID_ARGS envelope, exit 2
//   crash         — write nothing, exit 137
//   refuse-sigterm — ignore SIGTERM for 1.5s then exit (grace test)
import { appendFileSync, writeFileSync } from 'node:fs'

const mode = process.env.FAKE_CLI_MODE ?? 'ok'
const logFile = process.env.FAKE_CLI_LOG
const args = process.argv.slice(2)
const command = args[0] ?? ''

if (logFile) appendFileSync(logFile, `${JSON.stringify(args)}\n`)

function envelope(ok, data, error) {
  return JSON.stringify({
    version: '2.6',
    ok,
    command,
    ...(data !== undefined ? { data } : {}),
    ...(error !== undefined ? { error } : {}),
  })
}

const successData = {
  version: () => ({ version: '1.0.2', target: 'x86_64', os: 'linux' }),
  status: () => ({
    platform: 'linux',
    version: '1.0.2',
    permissions: {
      accessibility: { state: 'granted' },
      screen_recording: { state: 'not_required' },
      automation: { state: 'not_required' },
    },
    snapshot_id: null,
    ref_count: null,
    session_id: null,
    tracing: false,
    supported_surfaces: ['window'],
  }),
  'list-apps': () => ({
    apps: [
      { name: 'Finder', pid: 123 },
      { name: 'TextEdit', pid: 456, bundle_id: 'com.apple.TextEdit' },
    ],
  }),
  'list-windows': () => [
    { id: 'w-204749', title: 'Downloads', app_name: 'Finder', pid: 123, is_focused: true, accessible: true },
    { id: 'w-4521', title: 'Untitled', app_name: 'TextEdit', pid: 456, is_focused: false, accessible: true },
  ],
  snapshot: () => ({
    app: 'Finder',
    window: { id: 'w-204749', title: 'Downloads' },
    snapshot_id: 's8f3k2p9',
    ref_count: 2,
    complete: true,
    tree: {
      role: 'window',
      name: 'Downloads',
      children: [
        { ref_id: '@s8f3k2p9:e7', role: 'button', name: 'OK', states: ['enabled'] },
        { ref_id: '@s8f3k2p9:e8', role: 'textfield', name: 'Search', states: ['focused'] },
      ],
    },
  }),
  find: () => ({
    matches: [{ ref_id: '@s8f3k2p9:e5', role: 'button', name: 'OK', states: ['enabled'] }],
    total_matches: 1,
    truncated: false,
    snapshot_id: 's8f3k2p9',
  }),
  get: () => ({ property: 'text', ref: args[1] ?? '', value: 'OK' }),
  click: () => ({ action: 'click', disposition: { delivery: 'delivered_unverified', retry: 'unsafe' } }),
  'right-click': () => ({ action: 'right-click', disposition: { delivery: 'delivered_unverified', retry: 'unsafe' } }),
  type: () => ({ action: 'type', disposition: { delivery: 'delivered_unverified', retry: 'unsafe' } }),
  press: () => ({ action: 'press', disposition: { delivery: 'delivered_unverified', retry: 'unsafe' } }),
  'set-value': () => ({
    action: 'set-value',
    disposition: { delivery: 'delivered_verified', retry: 'unsafe' },
    post_state: { role: 'textfield', states: ['focused'], value: 'hello' },
  }),
  select: () => ({ action: 'select', disposition: { delivery: 'delivered_verified', retry: 'unsafe' } }),
  clear: () => ({ action: 'clear', disposition: { delivery: 'delivered_unverified', retry: 'unsafe' } }),
  screenshot: () => {
    const pathArg = args[args.length - 1] ?? '/tmp/x.png'
    return { path: pathArg, format: 'png', width: 800, height: 600, scale_factor: 2 }
  },
}[command] ?? (() => ({}))

const staleRef = {
  code: 'STALE_REF',
  message: '@s8f3k2p9:e7 not found in current RefMap',
  suggestion: 'Re-run a snapshot to obtain fresh refs, then retry with the new ref',
  recovery: { strategy: 'refresh_snapshot_then_retry_original', retryable: true, requires_fresh_snapshot: true },
  disposition: { delivery: 'not_delivered', retry: 'safe' },
}

const permDenied = {
  code: 'PERM_DENIED',
  message: 'Accessibility permission not granted',
  suggestion: 'Grant accessibility access to the terminal application',
  disposition: { delivery: 'not_delivered', retry: 'safe' },
}

switch (mode) {
  case 'ok':
    process.stdout.write(`${envelope(true, successData())}\n`)
    process.exit(0)
  case 'stale-ref':
    process.stdout.write(`${envelope(false, undefined, staleRef)}\n`)
    process.exit(1)
  case 'perm-denied':
    process.stdout.write(`${envelope(false, undefined, permDenied)}\n`)
    process.exit(1)
  case 'exit-2':
    process.stdout.write(`${envelope(false, undefined, {
      code: 'INVALID_ARGS',
      message: 'unexpected argument',
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    })}\n`)
    process.exit(2)
  case 'garbage':
    process.stdout.write('this is not json\n')
    process.exit(1)
  case 'wrong-version':
    process.stdout.write(`${JSON.stringify({ version: '9.9', ok: true, command, data: {} })}\n`)
    process.exit(0)
  case 'hang':
    setTimeout(() => {}, 30000)
    process.on('SIGTERM', () => process.exit(143))
    break
  case 'refuse-sigterm':
    process.on('SIGTERM', () => {
      setTimeout(() => process.exit(143), 1500)
    })
    setTimeout(() => process.exit(0), 10000)
    break
  case 'crash':
    process.exit(137)
  case 'fail-spawn':
    // Used with a command path that cannot execute; not reachable here.
    process.exit(127)
  default:
    process.stderr.write(`fake-cli: unknown mode ${mode}\n`)
    process.exit(64)
}
