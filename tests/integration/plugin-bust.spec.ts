/**
 * Plugin boot test: the REAL entry point (src/index.ts) imported and applied
 * through the official @deepseek-ai/cordis-plugin-loader — the same mechanism a
 * DSH profile row uses — with the real dsh-subprocess-local runtime spawning
 * the fake CLI, and the startup probe running.
 *
 * Complements tools.spec.ts (which mounts the plugin's components on a
 * hand-built context): this file proves the actual export shape survives the
 * Loader's import + export normalization, that inject resolution works, and
 * that disposing the loader entry withdraws every contribution.
 *
 * The loader and native executor are devDependencies that differ per tested
 * dsh line (loader 1.0.6 + no executor on 0.2.1-rc.3; loader 1.1.0 +
 * executor on 0.2.2), so both load dynamically here.
 *
 * @module tests/integration/plugin-bust
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { loadNativeToolExecutor, runToolFixture } from './pipeline.ts'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ComputerUse from '@deepseek-ai/dsh-computer-use'
import { makeFakeCli, testConfig, type FakeCli } from './harness.ts'

/** The loader plugin constructor (identical create/await/remove API on 1.0.x and 1.1.x). */
type LoaderPlugin = (new (ctx: Context, config?: { baseUrl?: string }) => unknown) | ((ctx: Context, config?: { baseUrl?: string }) => unknown)

/**
 * The loader service surface this test uses. Declared structurally because the
 * loader is imported indirectly (its version differs per dsh line), so its
 * module augmentation of `Context` is not visible to the type checker.
 */
interface LoaderService {
  create(options: { name: string; config?: unknown; disabled?: boolean }): Promise<string>
  await(): Promise<void>
  remove(id: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    loader: LoaderService
  }
}

let loaderPlugin: LoaderPlugin | undefined
let loaderResolved = false

/** Load the cordis plugin loader once (whichever line the scenario installed). */
async function loadLoader(): Promise<LoaderPlugin> {
  if (!loaderResolved) {
    loaderResolved = true
    try {
      // Variable specifier: the loader is a scenario devDependency whose version
      // differs per dsh line; TS must not resolve it statically.
      const specifier = '@deepseek-ai/cordis-plugin-loader'
      const mod = (await import(/* @vite-ignore */ specifier)) as { default?: unknown }
      loaderPlugin = (mod.default ?? mod) as LoaderPlugin
    } catch {
      loaderPlugin = undefined
    }
  }
  if (loaderPlugin === undefined) throw new Error('cordis-plugin-loader not installed in this scenario')
  return loaderPlugin
}

/** Mount the host services the plugin injects (what dsh-base provides). */
async function makeHost(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  // The native executor exists only on the 0.2.2 line; the 0.2.1 registry
  // executes tool calls directly without an executor indirection.
  const nativeExecutor = await loadNativeToolExecutor()
  if (nativeExecutor !== undefined) await ctx.plugin(nativeExecutor)
  await ctx.plugin(SubprocessLocal)
  await ctx.plugin(ComputerUse)
  return ctx
}

describe('DeskBridge through the official loader (real entry point)', () => {
  it('boots the real src/index.ts from a loader entry and registers everything', async () => {
    const fake: FakeCli = await makeFakeCli('ok')
    try {
      const ctx = await makeHost()
      const Loader = await loadLoader()
      await ctx.plugin(Loader, { baseUrl: import.meta.url })

      // The row a profile would carry: module specifier + config. probeAtStartup
      // runs the real version+status probe against the fake CLI.
      const config = testConfig({ probeAtStartup: true, claimComputerUse: true })
      const entryId = await ctx.loader.create({
        name: '../../src/index.ts',
        config,
      })
      await ctx.loader.await()

      // Eleven tools with model-visible schemas.
      const names = ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('desktop_')).sort()
      expect(names).toEqual([
        'desktop_click', 'desktop_find', 'desktop_get', 'desktop_list_apps', 'desktop_list_windows',
        'desktop_press', 'desktop_screenshot', 'desktop_set_value', 'desktop_snapshot', 'desktop_status',
        'desktop_type',
      ])

      // The guidance section is part of the assembled system prompt.
      const assembly = await ctx.systemPrompt.assemble()
      const sections = assembly.sections.map(s => s.name)
      expect(sections).toContain('computer-use:deskbridge')

      // The exclusive computer-use slot is claimed by the plugin.
      expect(String(ctx.computerUse.providerName)).toBe('deskbridge')

      // A tool call end-to-end through the loaded plugin.
      const result = await runToolFixture(ctx, {
        signal: new AbortController().signal,
        callId: Symbol('call') as never,
        name: 'desktop_status',
        arguments: {},
      })
      expect(result.isError).toBe(false)

      // Unload the entry exactly like disabling the profile row: everything withdraws.
      ctx.loader.remove(entryId)
      await ctx.loader.await()
      expect(ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('desktop_'))).toHaveLength(0)
      expect(ctx.computerUse.providerName).toBeUndefined()

      await ctx.fiber.dispose()
    } finally {
      await fake.cleanup()
    }
  })

  it('stays inert when config enabled is false (consent gate)', async () => {
    const fake: FakeCli = await makeFakeCli('ok')
    try {
      const ctx = await makeHost()
      const Loader = await loadLoader()
      await ctx.plugin(Loader, { baseUrl: import.meta.url })
      await ctx.loader.create({
        name: '../../src/index.ts',
        config: testConfig({ enabled: false }),
      })
      await ctx.loader.await()
      expect(ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('desktop_'))).toHaveLength(0)
      expect(ctx.computerUse.providerName).toBeUndefined()
      await ctx.fiber.dispose()
    } finally {
      await fake.cleanup()
    }
  })
})
