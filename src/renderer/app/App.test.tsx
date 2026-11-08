import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

const go = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

describe('App', () => {
  it('opens on the dashboard', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page')
  })

  it.each([
    ['Skills', 'Skills'],
    ['Goals', 'Goals'],
    ['Projects', 'Projects'],
    ['Profile', 'Profile'],
    ['Assistant', 'Assistant'],
    ['Target roles', 'Target roles'],
    ['Roadmaps', 'Roadmaps'],
    ['Settings', 'Settings'],
    ['Tasks', 'Tasks']
  ])('switches to %s', async (label) => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Dashboard' })
    go(label)
    expect(await screen.findByRole('heading', { name: label })).toBeTruthy()
  })

  it.each([
    ['Education', 'education'],
    ['Experience', 'work'],
    ['Certifications', 'certification']
  ])('switches to %s', async (label, kind) => {
    render(<App />)
    go(label)
    expect(await screen.findByRole('heading', { name: label })).toBeTruthy()
    expect(window.skillpilot.listRecords).toHaveBeenLastCalledWith(kind, undefined)
  })

  it.each([
    ['Experience', 'work', 'Skills used in this role'],
    ['Certifications', 'certification', 'Skills this certifies']
  ])('%s can link skills as evidence', async (label, kind, title) => {
    vi.mocked(window.skillpilot.listRecords).mockImplementation((asked) =>
      Promise.resolve({ ok: true, value: asked === kind ? [{ id: 3, values: { name: 'Cert', company: 'Co', role: 'Dev' } }] : [] })
    )
    render(<App />)
    go(label)
    fireEvent.click(await screen.findByRole('button', { name: /^Details for/ }))
    expect(await screen.findByText(title)).toBeTruthy()
  })

  it('reloads records when moving between sections', async () => {
    render(<App />)
    go('Education')
    await screen.findByRole('heading', { name: 'Education' })
    go('Experience')
    await screen.findByRole('heading', { name: 'Experience' })
    expect(vi.mocked(window.skillpilot.listRecords).mock.calls.map(([kind]) => kind)).toEqual(['education', 'work'])
  })

  it('minimizes back to the widget', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Dashboard' })
    go('Minimize to widget')
    expect(window.skillpilot.minimizeToWidget).toHaveBeenCalledOnce()
  })
})
