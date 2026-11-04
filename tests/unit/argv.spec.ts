import { describe, expect, it } from 'vitest'
import {
  findArgs,
  getArgs,
  listAppsArgs,
  listWindowsArgs,
  pressArgs,
  refActionArgs,
  screenshotArgs,
  selectArgs,
  setValueArgs,
  snapshotArgs,
  typeArgs,
  versionArgs,
} from '../../src/adapter/argv.ts'

describe('argv builders', () => {
  it('snapshot: app scope, defaults, all flags', () => {
    expect(snapshotArgs({ app: 'Finder' })).toEqual(['snapshot', '--app', 'Finder'])
    expect(snapshotArgs({
      app: 'Finder',
      windowId: 'w-204749',
      interactiveOnly: true,
      compact: true,
      skeleton: true,
      maxDepth: 3,
      root: '@s8f3k2p9:e4',
      timeoutMs: 8000,
    })).toEqual([
      'snapshot', '--app', 'Finder', '--window-id', 'w-204749',
      '--interactive-only', '--compact', '--skeleton',
      '--max-depth', '3', '--root', '@s8f3k2p9:e4', '--timeout-ms', '8000',
    ])
  })

  it('find: filters and exactly one selector', () => {
    expect(findArgs({ app: 'A', role: 'button', name: 'OK', exact: true, first: true }))
      .toEqual(['find', '--app', 'A', '--role', 'button', '--name', 'OK', '--exact', '--first'])
    expect(() => findArgs({ app: 'A', first: true, limit: 5 })).toThrow(/at most one/)
    expect(() => findArgs({ app: 'A', count: true, limit: 5 })).toThrow(/at most one/)
  })

  it('type: positional order is REF then TEXT', () => {
    expect(typeArgs({ ref: '@s8f3k2p9:e8', text: 'hello world' }))
      .toEqual(['type', '@s8f3k2p9:e8', 'hello world'])
    expect(typeArgs({ ref: '@s:e1', text: 'x', intervalMs: 50, timeoutMs: 0 }))
      .toEqual(['type', '@s:e1', 'x', '--interval-ms', '50', '--timeout-ms', '0'])
  })

  it('set-value and select: positional order REF then VALUE', () => {
    expect(setValueArgs({ ref: '@s:e1', value: 'v' })).toEqual(['set-value', '@s:e1', 'v'])
    expect(selectArgs({ ref: '@s:e1', value: 'opt' })).toEqual(['select', '@s:e1', 'opt'])
  })

  it('press: combo first, flags after', () => {
    expect(pressArgs({ combo: 'cmd+c' })).toEqual(['press', 'cmd+c'])
    expect(pressArgs({ combo: 'return', app: 'TextEdit', windowId: 'w-1', force: true }))
      .toEqual(['press', 'return', '--app', 'TextEdit', '--window-id', 'w-1', '--force'])
  })

  it('get: ref positional then --property', () => {
    expect(getArgs({ ref: '@s:e7', property: 'value' })).toEqual(['get', '@s:e7', '--property', 'value'])
  })

  it('ref actions: click/right-click/clear with timeout', () => {
    expect(refActionArgs('click', { ref: '@s:e7' })).toEqual(['click', '@s:e7'])
    expect(refActionArgs('right-click', { ref: '@s:e7', timeoutMs: 9000 }))
      .toEqual(['right-click', '@s:e7', '--timeout-ms', '9000'])
  })

  it('screenshot: exactly one scope, path last', () => {
    expect(screenshotArgs({ app: 'Finder', path: '/tmp/a.png' }))
      .toEqual(['screenshot', '--app', 'Finder', '/tmp/a.png'])
    expect(screenshotArgs({ windowId: 'w-5', path: '/tmp/a.png' }))
      .toEqual(['screenshot', '--window-id', 'w-5', '/tmp/a.png'])
    expect(() => screenshotArgs({ app: 'A', windowId: 'w-5', path: '/tmp/a.png' })).toThrow(/at most one/)
  })

  it('list-windows and list-apps', () => {
    expect(listWindowsArgs({ app: 'Finder' })).toEqual(['list-windows', '--app', 'Finder'])
    expect(listWindowsArgs({})).toEqual(['list-windows'])
    expect(listAppsArgs(5000)).toEqual(['list-apps', '--timeout-ms', '5000'])
    expect(listAppsArgs()).toEqual(['list-apps'])
    expect(versionArgs()).toEqual(['version'])
  })
})
