import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

const go = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

describe('App', () => {
  it('opens on the profile', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Profile' }).getAttribute('aria-current')).toBe('page')
  })

  it.each([
    ['Education', 'education'],
    ['Experience', 'work'],
    ['Certifications', 'certification']
  ])('switches to %s', async (label, kind) => {
    render(<App />)
    go(label)
    expect(await screen.findByRole('heading', { name: label })).toBeTruthy()
    expect(window.skillpilot.listRecords).toHaveBeenLastCalledWith(kind)
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
    await screen.findByRole('heading', { name: 'Profile' })
    go('Minimize to widget')
    expect(window.skillpilot.minimizeToWidget).toHaveBeenCalledOnce()
  })
})
