import { describe, expect, it, vi } from 'vitest'
import { StartApps, parseStartApps } from './start-apps'

describe('parseStartApps', () => {
  it('keeps real apps and drops uninstallers, help files, and links', () => {
    const json = JSON.stringify([
      { Name: 'Google Chrome', AppID: 'Chrome' },
      { Name: 'Uninstall MySQL', AppID: 'x' },
      { Name: 'Python 3.12 Documentation', AppID: 'y' },
      { Name: 'Some site', AppID: 'https://example.com' },
      { Name: '', AppID: 'z' },
      { Name: 'Notepad', AppID: 5 },
      null
    ])
    expect(parseStartApps(json)).toEqual([{ name: 'Google Chrome', id: 'Chrome' }])
  })

  it('reads a single app, and survives bad output', () => {
    expect(parseStartApps('{"Name":"Calculator","AppID":"Calc!App"}')).toEqual([{ name: 'Calculator', id: 'Calc!App' }])
    expect(parseStartApps('not json')).toEqual([])
  })
})

describe('StartApps', () => {
  it('reads once, shares a read in progress, and refreshes when old', async () => {
    let now = 0
    const read = vi.fn(() => Promise.resolve('[{"Name":"Notepad","AppID":"N"}]'))
    const apps = new StartApps(read, () => now, 1_000)
    const [a, b] = await Promise.all([apps.get(), apps.get()])
    expect(a).toEqual([{ name: 'Notepad', id: 'N' }])
    expect(b).toBe(a)
    expect(read).toHaveBeenCalledOnce()
    now = 500
    await apps.get()
    expect(read).toHaveBeenCalledOnce()
    now = 1_500
    await apps.get()
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keeps the last list if reading fails', async () => {
    let now = 0
    const read = vi.fn().mockResolvedValueOnce('[{"Name":"Notepad","AppID":"N"}]').mockRejectedValueOnce(new Error('boom'))
    const apps = new StartApps(read, () => now, 10)
    await apps.get()
    now = 100
    await expect(apps.get()).resolves.toEqual([{ name: 'Notepad', id: 'N' }])
  })
})
