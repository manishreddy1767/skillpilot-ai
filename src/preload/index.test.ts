import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Channel, type SkillPilotApi } from '../shared/ipc'

const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { send: vi.fn() }
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
      'hoverEnter',
      'hoverLeave',
      'minimizeToWidget',
      'openApp'
    ])
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

  it('uses a different channel for every message', () => {
    const channels = Object.values(Channel)
    expect(new Set(channels).size).toBe(channels.length)
  })
})
