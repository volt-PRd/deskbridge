import { describe, expect, it } from 'vitest'
import {
  InvalidToolInputError,
  validateAppName,
  validateClickButton,
  validateCombo,
  validateGetProperty,
  validateRef,
  validateScreenshotPath,
  validateScrollDirection,
  validateSetValueMode,
  validateText,
  validateWindowId,
} from '../../src/validation.ts'

describe('input validation', () => {
  it('accepts refs matching the CLI grammar and rejects the rest', () => {
    expect(validateRef('@s8f3k2p9:e7')).toBe('@s8f3k2p9:e7')
    expect(validateRef('@a-b_C3:e1')).toBe('@a-b_C3:e1')
    for (const bad of ['@e8', 's8f3k2p9:e7', '@s:e0', '@s:e', '@:e1', '@s:e12345678901', 'plain', '@s:x1', '@s:e1:extra']) {
      expect(() => validateRef(bad)).toThrow(InvalidToolInputError)
    }
  })

  it('rejects empty or dash-leading values everywhere (flag-injection guard)', () => {
    expect(() => validateAppName('--foo')).toThrow(/must not start/)
    expect(() => validateAppName('')).toThrow(/empty/)
    expect(validateAppName('ok')).toBe('ok')
    expect(() => validateWindowId('-w')).toThrow(/must not start/)
    expect(() => validateText('-x', 'text', 100)).toThrow(/must not start/)
    expect(() => validateCombo('--force')).toThrow(/must not start/)
  })

  it('rejects NUL bytes', () => {
    expect(() => validateAppName('a\0b')).toThrow(/NUL/)
    expect(() => validateText('a\0b', 'text', 100)).toThrow(/NUL/)
  })

  it('bounds app name length', () => {
    expect(() => validateAppName('x'.repeat(257))).toThrow(/too long/)
    expect(validateAppName('x'.repeat(256))).toBe('x'.repeat(256))
  })

  it('window ids: accepts platform shapes, rejects others', () => {
    expect(validateWindowId('w-204749')).toBe('w-204749')
    expect(validateWindowId('w-1.7-frame')).toBe('w-1.7-frame')
    expect(() => validateWindowId('204749')).toThrow(/must look like/)
    expect(() => validateWindowId('w-')).toThrow(/must look like/)
  })

  it('text length bound from config', () => {
    expect(() => validateText('x'.repeat(11), 'text', 10)).toThrow(/maximum length/)
    expect(validateText('x'.repeat(10), 'text', 10)).toBe('x'.repeat(10))
  })

  it('combo grammar: modifiers, keys, rejects unknown modifiers', () => {
    for (const good of ['return', 'escape', 'cmd+c', 'ctrl+shift+t', 'shift+tab', 'alt+f4', 'win+l', 'meta+x', 'command+q', 'option+backspace', 'a', 'H']) {
      expect(validateCombo(good)).toBe(good)
    }
    for (const bad of ['cmd+', '+c', 'foo+c', 'cmd++c', 'cmd|c', 'cmd c']) {
      expect(() => validateCombo(bad)).toThrow(InvalidToolInputError)
    }
  })

  it('enum validations', () => {
    expect(validateGetProperty('text')).toBe('text')
    expect(() => validateGetProperty('content')).toThrow(/property/)
    expect(validateScrollDirection('up')).toBe('up')
    expect(() => validateScrollDirection('diagonal')).toThrow(/direction/)
    expect(validateSetValueMode('set-value')).toBe('set-value')
    expect(() => validateSetValueMode('paste')).toThrow(/mode/)
    expect(validateClickButton('right')).toBe('right')
    expect(() => validateClickButton('middle')).toThrow(/button/)
  })

  it('screenshot paths: absolute, no traversal', () => {
    expect(validateScreenshotPath('/tmp/shot/x.png')).toBe('/tmp/shot/x.png')
    expect(validateScreenshotPath('C:\\Users\\x\\y.png')).toBe('C:\\Users\\x\\y.png')
    expect(() => validateScreenshotPath('relative/x.png')).toThrow(/absolute/)
    expect(() => validateScreenshotPath('/tmp/../etc/passwd.png')).toThrow(/traverse/)
  })
})
