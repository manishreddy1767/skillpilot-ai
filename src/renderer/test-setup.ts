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
    minimizeToWidget: vi.fn(),
    getOverview: vi.fn(() =>
      Promise.resolve({ ok: true as const, value: { name: '', currentGoal: '', targetRoles: '' } })
    ),
    onOverviewChanged: vi.fn(() => () => undefined),
    getProfile: vi.fn(() => Promise.resolve({ ok: true as const, value: {} })),
    saveProfile: vi.fn((values) => Promise.resolve({ ok: true as const, value: values })),
    listRecords: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    saveRecord: vi.fn((_kind, id, values) =>
      Promise.resolve({ ok: true as const, value: { id: id ?? 1, values } })
    ),
    deleteRecord: vi.fn(() => Promise.resolve({ ok: true as const, value: true }))
  }
  window.skillpilot = api
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture = vi.fn()
})

afterEach(cleanup)
