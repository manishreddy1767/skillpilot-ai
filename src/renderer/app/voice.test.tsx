import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StoredRecord } from '../../shared/career'
import { App } from './App'
import { AssistantView } from './AssistantView'
import { carryOut, localToday, type VoiceContext } from './voice-actions'

const api = () => vi.mocked(window.skillpilot)
const today = '2026-11-08'
const task = (id: number, title: string, extra: Record<string, string> = {}): StoredRecord => ({
  id,
  values: { title, status: 'open', ...extra }
})
const context = (): VoiceContext => ({ api: window.skillpilot, navigate: vi.fn(), today })
const heard = (text: string) => api().listen.mockResolvedValueOnce({ ok: true, value: { text, confidence: 0.9 } })
const mic = () => screen.getByRole('button', { name: 'Speak a message or command' })
const ready = () =>
  api().getAiStatus.mockResolvedValue({ ok: true, value: { provider: 'claude', model: 'm', hasKey: true, blocked: '' } })

describe('localToday', () => {
  it('uses the laptop clock, not UTC', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('carryOut', () => {
  it('adds a task for the spoken day and says which day', async () => {
    await expect(carryOut({ kind: 'addTask', title: 'Read', dueDate: '2026-11-09' }, context())).resolves.toBe(
      'Added the task "Read" for tomorrow.'
    )
    expect(api().saveRecord).toHaveBeenCalledWith('task', null, { title: 'Read', dueDate: '2026-11-09' })
    await expect(carryOut({ kind: 'addTask', title: 'Now', dueDate: today }, context())).resolves.toContain('for today')
    await expect(carryOut({ kind: 'addTask', title: 'Later', dueDate: '2026-11-13' }, context())).resolves.toContain(
      'Friday 13 November'
    )
  })

  it('reports a save that failed', async () => {
    api().saveRecord.mockResolvedValueOnce({ ok: false, message: 'Disk full.' })
    await expect(carryOut({ kind: 'addTask', title: 'Read', dueDate: today }, context())).resolves.toBe('Disk full.')
  })

  it('adds a skill or goal once, never a duplicate', async () => {
    await expect(carryOut({ kind: 'addSkill', name: 'Docker' }, context())).resolves.toBe('Added Docker to your skills.')
    expect(api().saveRecord).toHaveBeenCalledWith('skill', null, { name: 'Docker' })
    api().listRecords.mockResolvedValueOnce({ ok: true, value: [{ id: 1, values: { name: 'docker' } }] })
    await expect(carryOut({ kind: 'addSkill', name: 'Docker' }, context())).resolves.toContain('already')
    await expect(carryOut({ kind: 'addGoal', title: 'Get hired' }, context())).resolves.toBe('Added the goal "Get hired".')
    expect(api().saveRecord).toHaveBeenCalledTimes(2)
  })

  it('ticks off the one matching open task', async () => {
    api().listRecords.mockResolvedValue({
      ok: true,
      value: [task(1, 'Read chapter four', { status: 'done' }), task(2, 'Read chapter four again'), task(3, 'Practise SQL')]
    })
    await expect(carryOut({ kind: 'completeTask', query: 'practise sql' }, context())).resolves.toBe(
      'Marked "Practise SQL" as done.'
    )
    expect(api().completeTask).toHaveBeenCalledExactlyOnceWith(3)
  })

  it('ticks nothing off when it is unsure', async () => {
    api().listRecords.mockResolvedValue({ ok: true, value: [task(1, 'Read chapter four'), task(2, 'Read the guide')] })
    await expect(carryOut({ kind: 'completeTask', query: 'read' }, context())).resolves.toContain('nothing was ticked off')
    expect(api().completeTask).not.toHaveBeenCalled()
  })

  it("lists what is due today and overdue, but not later or finished tasks", async () => {
    api().listRecords.mockResolvedValue({
      ok: true,
      value: [
        task(1, 'Overdue', { dueDate: '2026-11-01' }),
        task(2, 'Today', { dueDate: today }),
        task(3, 'Later', { dueDate: '2026-11-20' }),
        task(4, 'Finished', { dueDate: today, status: 'done' }),
        task(5, 'Undated')
      ]
    })
    await expect(carryOut({ kind: 'whatsDue' }, context())).resolves.toBe('Due today: Overdue, Today.')
    api().listRecords.mockResolvedValue({ ok: true, value: [] })
    await expect(carryOut({ kind: 'whatsDue' }, context())).resolves.toBe('Nothing is due today.')
  })

  it('opens a section and minimises', async () => {
    const ctx = context()
    await expect(carryOut({ kind: 'navigate', section: 'skills', label: 'Skills' }, ctx)).resolves.toBe('Opened Skills.')
    expect(ctx.navigate).toHaveBeenCalledWith('skills')
    await carryOut({ kind: 'minimize' }, ctx)
    expect(api().minimizeToWidget).toHaveBeenCalled()
  })
})

describe('the microphone in the chat bar', () => {
  it('sits in the input bar with Send, and shows listening while the microphone is open', async () => {
    let finish: (value: { ok: true; value: { text: string; confidence: number } }) => void = () => undefined
    let ready: () => void = () => undefined
    api().onVoiceReady.mockImplementation((listener) => {
      ready = listener
      return () => undefined
    })
    api().listen.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    render(<AssistantView />)
    const bar = screen.getByLabelText('Your message').closest('.composer')!
    expect(bar.contains(mic())).toBe(true)
    expect(bar.contains(screen.getByRole('button', { name: 'Send' }))).toBe(true)

    fireEvent.click(mic())
    expect(await screen.findByText('Starting the microphone…')).toBeTruthy()
    act(() => ready())
    expect(await screen.findByText('Listening… speak now.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop listening' }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => finish({ ok: true, value: { text: '', confidence: 0 } }))
    expect(await screen.findByText(/Nothing was heard/)).toBeTruthy()
  })

  it('carries out a spoken command straight away and says what it did', async () => {
    heard('add task read chapter four')
    render(<AssistantView />)
    fireEvent.click(mic())
    expect(await screen.findByText(/Heard "add task read chapter four". Added the task "Read chapter four" for today./)).toBeTruthy()
    expect(api().saveRecord).toHaveBeenCalledWith('task', null, { title: 'Read chapter four', dueDate: localToday() })
    expect(api().sendChat).not.toHaveBeenCalled()
  })

  it('sends a spoken question to the assistant and applies its suggestions', async () => {
    ready()
    heard('What should I learn next?')
    const proposal = { id: 9, kind: 'addSkill' as const, summary: 'Add skill: Go', details: [] }
    const old = { ...proposal, id: 4, summary: 'Older one' }
    api().listProposals.mockResolvedValueOnce({ ok: true, value: [] }) // ProposalList on load
    api().listProposals.mockResolvedValueOnce({ ok: true, value: [old] })
    api().listProposals.mockResolvedValueOnce({ ok: true, value: [old, proposal] })
    render(<AssistantView />)
    await waitFor(() => expect(api().getAiStatus).toHaveBeenCalled())
    fireEvent.click(mic())
    expect(await screen.findByText('Applied 1 suggestion from the assistant.')).toBeTruthy()
    expect(api().sendChat).toHaveBeenCalledWith('What should I learn next?')
    expect(api().acceptProposal).toHaveBeenCalledExactlyOnceWith(9)
  })

  it('does not accept suggestions for typed messages', async () => {
    ready()
    api().listProposals.mockResolvedValue({ ok: true, value: [{ id: 9, kind: 'addSkill', summary: 'Add skill: Go', details: [] }] })
    render(<AssistantView />)
    await waitFor(() => expect(api().getAiStatus).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api().sendChat).toHaveBeenCalledWith('Hi'))
    expect(api().acceptProposal).not.toHaveBeenCalled()
  })

  it('only fills the message box when spoken requests should wait', async () => {
    api().getSettings.mockResolvedValue({ ok: true, value: { voiceActNow: 'off' } })
    heard('add skill docker')
    render(<AssistantView />)
    await waitFor(() => expect(api().getSettings).toHaveBeenCalled())
    await act(async () => undefined)
    fireEvent.click(mic())
    expect(await screen.findByText(/Check it, then press Send/)).toBeTruthy()
    expect((screen.getByLabelText('Your message') as HTMLTextAreaElement).value).toBe('add skill docker')
    expect(api().saveRecord).not.toHaveBeenCalled()
  })

  it('keeps a spoken question in the box when the assistant is not set up', async () => {
    api().getAiStatus.mockResolvedValue({
      ok: true,
      value: { provider: 'off', model: '', hasKey: false, blocked: 'Turn on an AI provider in Settings.' }
    })
    heard('Am I ready?')
    render(<AssistantView />)
    expect(await screen.findByText('Turn on an AI provider in Settings.')).toBeTruthy()
    fireEvent.click(mic())
    expect(await screen.findByText(/not set up, so it was not sent/)).toBeTruthy()
    expect((screen.getByLabelText('Your message') as HTMLTextAreaElement).value).toBe('Am I ready?')
    expect(api().sendChat).not.toHaveBeenCalled()
  })

  it('shows a microphone problem plainly', async () => {
    api().listen.mockResolvedValueOnce({ ok: false, message: 'No microphone could be used.' })
    render(<AssistantView />)
    fireEvent.click(mic())
    expect((await screen.findByRole('alert')).textContent).toBe('No microphone could be used.')
  })

  it('the stop button stops listening and ignores anything heard late', async () => {
    let finish: (value: { ok: true; value: { text: string; confidence: number } }) => void = () => undefined
    api().listen.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    render(<AssistantView />)
    fireEvent.click(mic())
    fireEvent.click(await screen.findByRole('button', { name: 'Stop listening' }))
    await waitFor(() => expect(api().stopListening).toHaveBeenCalled())
    await act(async () => finish({ ok: true, value: { text: 'add skill docker', confidence: 1 } }))
    expect(api().saveRecord).not.toHaveBeenCalled()
    expect(mic()).toBeTruthy()
  })

  it('stops the microphone when leaving the screen', () => {
    const { unmount } = render(<AssistantView />)
    unmount()
    expect(api().stopListening).toHaveBeenCalled()
  })

  it('"open my skills" switches screens and says why', async () => {
    heard('open my skills')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Assistant', exact: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'Speak a message or command' }))
    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeTruthy()
    expect(screen.getByText('Heard "open my skills". Opened Skills.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skills', exact: true }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Opened Skills/)).toBeNull()
  })
})
