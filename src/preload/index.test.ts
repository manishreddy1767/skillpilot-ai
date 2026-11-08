import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Channel, type SkillPilotApi } from '../shared/ipc'

const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    send: vi.fn(),
    invoke: vi.fn(() => Promise.resolve('reply')),
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))
vi.mock('electron', () => electron)

let api: SkillPilotApi
let exposedCalls: unknown[][]

beforeAll(async () => {
  await import('./index')
  exposedCalls = [...electron.contextBridge.exposeInMainWorld.mock.calls]
  api = exposedCalls[0]?.[1] as SkillPilotApi
})

beforeEach(() => electron.ipcRenderer.send.mockClear())

describe('preload bridge', () => {
  it('exposes one object, under one name', () => {
    expect(exposedCalls).toHaveLength(1)
    expect(exposedCalls[0]?.[0]).toBe('skillpilot')
  })

  it('exposes only functions, and never ipcRenderer itself', () => {
    for (const value of Object.values(api)) expect(typeof value).toBe('function')
    expect(Object.keys(api).sort()).toEqual([
      'dragMove',
      'dragPress',
      'dragRelease',
      'deleteRecord',
      'getDashboard',
      'getOverview',
      'getProfile',
      'hoverEnter',
      'hoverLeave',
      'listLinks',
      'listRecords',
      'minimizeToWidget',
      'onOverviewChanged',
      'openApp',
      'saveProfile',
      'saveRecord',
      'setLink',
      'getSettings',
      'saveSettings',
      'getAiStatus',
      'saveApiKey',
      'removeApiKey',
      'getChat',
      'sendChat',
      'clearChat',
      'getGapAnalysis',
      'draftRequirements',
      'createGapReport',
      'generateRoadmap',
      'suggestTasks',
      'listProposals',
      'acceptProposal',
      'rejectProposal',
      'getAiLog',
      'getLearning',
      'getRecommendation',
      'getRoleReadiness',
      'completeTask',
      'rescheduleRoadmap',
      'exportData',
      'importData',
      'listBackups',
      'restoreBackup',
      'eraseAll',
      'getHistory'
    ].sort())
  })

  it('passes the grab offset with a press', () => {
    api.dragPress({ x: 3, y: 4 })
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith(Channel.DragPress, { x: 3, y: 4 })
  })

  it.each([
    ['dragMove', Channel.DragMove],
    ['dragRelease', Channel.DragRelease],
    ['hoverEnter', Channel.HoverEnter],
    ['hoverLeave', Channel.HoverLeave],
    ['openApp', Channel.OpenApp],
    ['minimizeToWidget', Channel.MinimizeToWidget]
  ] as const)('%s sends on its own channel', (method, channel) => {
    api[method]()
    expect(electron.ipcRenderer.send).toHaveBeenCalledExactlyOnceWith(channel)
  })

  it('sends data requests on their own channels and returns the reply', async () => {
    const { invoke } = electron.ipcRenderer
    const values = { fullName: 'Sam' }
    await expect(api.getOverview()).resolves.toBe('reply')
    expect(invoke).toHaveBeenLastCalledWith(Channel.GetOverview)
    await api.getProfile()
    expect(invoke).toHaveBeenLastCalledWith(Channel.GetProfile)
    await api.saveProfile(values)
    expect(invoke).toHaveBeenLastCalledWith(Channel.SaveProfile, values)
    await api.listRecords('evidence', 5)
    expect(invoke).toHaveBeenLastCalledWith(Channel.ListRecords, 'evidence', 5)
    await api.saveRecord('evidence', 3, values, 5)
    expect(invoke).toHaveBeenLastCalledWith(Channel.SaveRecord, 'evidence', 3, values, 5)
    await api.deleteRecord('evidence', 3, 5)
    expect(invoke).toHaveBeenLastCalledWith(Channel.DeleteRecord, 'evidence', 3, 5)
    await api.listLinks('goalSkill', 2)
    expect(invoke).toHaveBeenLastCalledWith(Channel.ListLinks, 'goalSkill', 2)
    await api.setLink('goalSkill', 2, 4, true, 3)
    expect(invoke).toHaveBeenLastCalledWith(Channel.SetLink, 'goalSkill', 2, 4, true, 3)
    await api.getDashboard()
    expect(invoke).toHaveBeenLastCalledWith(Channel.GetDashboard)
    await api.saveApiKey('k')
    expect(invoke).toHaveBeenLastCalledWith(Channel.SaveApiKey, 'k')
    await api.sendChat('hi')
    expect(invoke).toHaveBeenLastCalledWith(Channel.SendChat, 'hi')
    await api.acceptProposal(2)
    expect(invoke).toHaveBeenLastCalledWith(Channel.AcceptProposal, 2)
  })

  it('forwards overview changes without the event, and can stop', () => {
    const { on, removeListener } = electron.ipcRenderer
    const listener = vi.fn()
    const stop = api.onOverviewChanged(listener)
    const [channel, forward] = on.mock.lastCall as unknown as [string, (...args: unknown[]) => void]
    expect(channel).toBe(Channel.OverviewChanged)
    forward({ sender: 'secret' })
    expect(listener).toHaveBeenCalledExactlyOnceWith()
    stop()
    expect(removeListener).toHaveBeenCalledWith(Channel.OverviewChanged, forward)
  })

  it('uses a different channel for every message', () => {
    const channels = Object.values(Channel)
    expect(new Set(channels).size).toBe(channels.length)
  })
})
