import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import type { SkillPilotApi } from '../shared/ipc'

beforeEach(() => {
  const api: SkillPilotApi = {
    dragPress: vi.fn(),
    dragMove: vi.fn(),
    dragRelease: vi.fn(),
    hoverEnter: vi.fn(),
    hoverLeave: vi.fn(),
    openApp: vi.fn(),
    minimizeToWidget: vi.fn()
  }
  window.skillpilot = api
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture = vi.fn()
})

afterEach(cleanup)
