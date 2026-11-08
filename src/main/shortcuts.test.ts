import { describe, expect, it, vi } from 'vitest'
import { SHORTCUTS, applyShortcuts } from './shortcuts'

function registry(taken: string[] = []) {
  const held = new Map<string, () => void>()
  return {
    held,
    register: vi.fn((accelerator: string, callback: () => void) => {
      if (taken.includes(accelerator)) return false
      held.set(accelerator, callback)
      return true
    }),
    unregister: vi.fn((accelerator: string) => void held.delete(accelerator))
  }
}

const actions = () => ({ toggleWidget: vi.fn(), openApp: vi.fn() })

describe('applyShortcuts', () => {
  it('registers both shortcuts to their actions', () => {
    const r = registry()
    const a = actions()
    expect(applyShortcuts(r, true, a)).toEqual([])
    r.held.get(SHORTCUTS.toggleWidget)!()
    r.held.get(SHORTCUTS.openApp)!()
    expect(a.toggleWidget).toHaveBeenCalledOnce()
    expect(a.openApp).toHaveBeenCalledOnce()
  })

  it('removes them when turned off', () => {
    const r = registry()
    applyShortcuts(r, true, actions())
    expect(applyShortcuts(r, false, actions())).toEqual([])
    expect(r.held.size).toBe(0)
  })

  it('can be applied again without doubling up', () => {
    const r = registry()
    applyShortcuts(r, true, actions())
    applyShortcuts(r, true, actions())
    expect(r.held.size).toBe(2)
  })

  it('reports a shortcut another app already holds', () => {
    const r = registry([SHORTCUTS.openApp])
    expect(applyShortcuts(r, true, actions())).toEqual([SHORTCUTS.openApp])
    expect([...r.held.keys()]).toEqual([SHORTCUTS.toggleWidget])
  })
})
