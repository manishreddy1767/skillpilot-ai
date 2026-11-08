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
      Promise.resolve({
        ok: true as const,
        value: {
          name: '',
          currentGoal: '',
          targetRoles: '',
          progress: null,
          learning: [],
          nextDeadline: null,
          latestAchievement: null,
          tasks: [],
          streak: 0,
          recommendation: null
        }
      })
    ),
    onOverviewChanged: vi.fn(() => () => undefined),
    getProfile: vi.fn(() => Promise.resolve({ ok: true as const, value: {} })),
    saveProfile: vi.fn((values) => Promise.resolve({ ok: true as const, value: values })),
    listRecords: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    saveRecord: vi.fn((_kind, id, values) =>
      Promise.resolve({ ok: true as const, value: { id: id ?? 1, values } })
    ),
    deleteRecord: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    listLinks: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    setLink: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    getDashboard: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: { overall: null, skills: [], goals: [], projects: [], deadlines: [], achievements: [] }
      })
    ),
    getSettings: vi.fn(() => Promise.resolve({ ok: true as const, value: {} })),
    saveSettings: vi.fn((values) => Promise.resolve({ ok: true as const, value: values })),
    getAiStatus: vi.fn(() =>
      Promise.resolve({ ok: true as const, value: { provider: 'off', model: '', hasKey: false, blocked: '' } })
    ),
    saveApiKey: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    removeApiKey: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    getChat: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    sendChat: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    clearChat: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    getGapAnalysis: vi.fn(() =>
      Promise.resolve({ ok: true as const, value: { analysis: { readiness: null, items: [] }, report: null } })
    ),
    draftRequirements: vi.fn(() => Promise.resolve({ ok: true as const, value: 0 })),
    createGapReport: vi.fn(() =>
      Promise.resolve({ ok: true as const, value: { id: 1, summary: '', priorities: [], createdAt: '' } })
    ),
    generateRoadmap: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    suggestTasks: vi.fn(() => Promise.resolve({ ok: true as const, value: 0 })),
    listProposals: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    acceptProposal: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    rejectProposal: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    getAiLog: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    getLearning: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          streak: 0,
          minutesThisWeek: 0,
          weeklyTarget: 300,
          pace: 'none' as const,
          todayTasks: [],
          plannedMinutesToday: 0,
          roadmaps: []
        }
      })
    ),
    getRecommendation: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
    getRoleReadiness: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    completeTask: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    rescheduleRoadmap: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    exportData: vi.fn(() => Promise.resolve({ ok: true as const, value: null as string | null })),
    importData: vi.fn(() => Promise.resolve({ ok: true as const, value: null as string | null })),
    listBackups: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    restoreBackup: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    eraseAll: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    getHistory: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          trend: [],
          month: { month: '2026-11', minutes: 0, previousMinutes: 0, tasksDone: 0, achievements: 0, improved: [], overallChange: null }
        }
      })
    )
  }
  window.skillpilot = api
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture = vi.fn()
})

afterEach(cleanup)
