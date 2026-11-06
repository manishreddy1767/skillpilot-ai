import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../../shared/settings'
import { AssistantView } from './AssistantView'
import { ProposalList } from './ProposalList'
import { RoadmapsView } from './RoadmapsView'
import { RolesView } from './RolesView'
import { SettingsView } from './SettingsView'

const api = () => vi.mocked(window.skillpilot)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const ready = () =>
  api().getAiStatus.mockResolvedValue({
    ok: true,
    value: { provider: 'claude', model: 'm', hasKey: true, blocked: '' }
  })
const proposal = { id: 3, kind: 'addSkill' as const, summary: 'Add skill: Go', details: [{ label: 'Why', value: 'Useful' }] }
const message = (id: number, role: 'user' | 'assistant', content: string) => ({ id, role, content, createdAt: 'now' })

describe('ProposalList', () => {
  it('shows nothing without suggestions', async () => {
    const { container } = render(<ProposalList />)
    await waitFor(() => expect(api().listProposals).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })

  it('shows what would be added and says nothing is saved yet', async () => {
    api().listProposals.mockResolvedValue({ ok: true, value: [proposal] })
    render(<ProposalList />)
    expect(await screen.findByText('Add skill: Go')).toBeTruthy()
    expect(screen.getByText('Why: Useful')).toBeTruthy()
    expect(screen.getByText(/Nothing here is saved until you accept/)).toBeTruthy()
  })

  it('accepting reloads and reports the change', async () => {
    api().listProposals.mockResolvedValueOnce({ ok: true, value: [proposal] })
    const onChange = vi.fn()
    render(<ProposalList onChange={onChange} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Add skill: Go' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
    expect(api().acceptProposal).toHaveBeenCalledWith(3)
    expect(api().rejectProposal).not.toHaveBeenCalled()
  })

  it('rejecting calls reject only', async () => {
    api().listProposals.mockResolvedValueOnce({ ok: true, value: [proposal] })
    render(<ProposalList />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject Add skill: Go' }))
    await waitFor(() => expect(api().rejectProposal).toHaveBeenCalledWith(3))
    expect(api().acceptProposal).not.toHaveBeenCalled()
  })

  it('shows why a suggestion could not be accepted', async () => {
    api().listProposals.mockResolvedValue({ ok: true, value: [proposal] })
    api().acceptProposal.mockResolvedValue({ ok: false, message: 'It may already exist.' })
    render(<ProposalList />)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Add skill: Go' }))
    expect((await screen.findByRole('alert')).textContent).toBe('It may already exist.')
  })
})

describe('AssistantView', () => {
  it('explains when AI is unavailable and blocks sending', async () => {
    api().getAiStatus.mockResolvedValue({
      ok: true,
      value: { provider: 'off', model: '', hasKey: false, blocked: 'AI is off. Choose a provider in Settings.' }
    })
    render(<AssistantView />)
    expect(await screen.findByText('AI is off. Choose a provider in Settings.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Hi' } })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true)
  })

  it('loads the conversation', async () => {
    ready()
    api().getChat.mockResolvedValue({ ok: true, value: [message(1, 'user', 'Earlier')] })
    render(<AssistantView />)
    expect(await screen.findByText('Earlier')).toBeTruthy()
  })

  it('sends a message, shows the reply, and looks for new suggestions', async () => {
    ready()
    api().sendChat.mockResolvedValue({ ok: true, value: [message(1, 'user', 'Hi'), message(2, 'assistant', 'Hello')] })
    render(<AssistantView />)
    await screen.findByRole('button', { name: 'Send' })
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Hi' } })
    const calls = api().listProposals.mock.calls.length
    click('Send')
    expect(await screen.findByText('Hello')).toBeTruthy()
    expect(api().listProposals.mock.calls.length).toBeGreaterThan(calls)
    expect(screen.getByLabelText<HTMLTextAreaElement>('Your message').value).toBe('')
  })

  it('keeps the message and shows an error if sending fails', async () => {
    ready()
    api().sendChat.mockResolvedValue({ ok: false, message: 'No connection.' })
    render(<AssistantView />)
    await screen.findByRole('button', { name: 'Send' })
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Hi' } })
    click('Send')
    expect((await screen.findByRole('alert')).textContent).toBe('No connection.')
    expect(screen.getByLabelText<HTMLTextAreaElement>('Your message').value).toBe('Hi')
  })

  it('clears the conversation', async () => {
    ready()
    api().getChat.mockResolvedValue({ ok: true, value: [message(1, 'user', 'Earlier')] })
    render(<AssistantView />)
    await screen.findByText('Earlier')
    click('Clear conversation')
    await waitFor(() => expect(screen.queryByText('Earlier')).toBeNull())
  })
})

describe('RolesView', () => {
  const role = { id: 5, values: { title: 'Frontend Dev', notes: '' } }
  const open = async () => {
    api().listRecords.mockImplementation((kind) => Promise.resolve({ ok: true, value: kind === 'targetRole' ? [role] : [] }))
    render(<RolesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Frontend Dev' }))
  }

  it('shows readiness and the gap with words, with no AI needed', async () => {
    api().getGapAnalysis.mockResolvedValue({
      ok: true,
      value: {
        report: null,
        analysis: {
          readiness: 40,
          items: [{ skillName: 'CSS', requiredLevel: 3, importance: 3, status: 'missing', claimed: 0, demonstrated: 0 }]
        }
      }
    })
    await open()
    expect(await screen.findByRole('progressbar', { name: 'Frontend Dev readiness' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'CSS' })).toBeTruthy()
    expect(screen.getByText('Missing')).toBeTruthy()
  })

  it('disables AI actions when unavailable, and says why', async () => {
    api().getAiStatus.mockResolvedValue({
      ok: true,
      value: { provider: 'claude', model: 'm', hasKey: false, blocked: 'Add your Anthropic API key in Settings.' }
    })
    await open()
    expect(await screen.findByText('Add your Anthropic API key in Settings.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create roadmap' }).disabled).toBe(true)
  })

  it.each([
    ['Draft requirements', 'draftRequirements'],
    ['Write gap report', 'createGapReport'],
    ['Create roadmap', 'generateRoadmap']
  ] as const)('%s calls the AI for this role', async (label, method) => {
    ready()
    await open()
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: label }).disabled).toBe(false)
    )
    click(label)
    await waitFor(() => expect(api()[method]).toHaveBeenCalledWith(5))
  })

  it('shows an AI error', async () => {
    ready()
    api().generateRoadmap.mockResolvedValue({ ok: false, message: 'Rate limited.' })
    await open()
    click('Create roadmap')
    expect((await screen.findByRole('alert')).textContent).toBe('Rate limited.')
  })

  it('shows the saved report', async () => {
    api().getGapAnalysis.mockResolvedValue({
      ok: true,
      value: {
        analysis: { readiness: null, items: [] },
        report: { id: 1, summary: 'Getting close', priorities: ['Learn CSS'], createdAt: '2026-11-06' }
      }
    })
    await open()
    expect(await screen.findByText('Getting close')).toBeTruthy()
    expect(screen.getByText('Learn CSS')).toBeTruthy()
  })
})

describe('RoadmapsView', () => {
  it('opens a roadmap to its topics', async () => {
    api().listRecords.mockImplementation((kind) =>
      Promise.resolve({ ok: true, value: kind === 'roadmap' ? [{ id: 2, values: { title: 'Path', startDate: '' } }] : [] })
    )
    render(<RoadmapsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Path' }))
    await waitFor(() => expect(api().listRecords).toHaveBeenCalledWith('roadmapItem', 2))
  })
})

describe('SettingsView', () => {
  const load = () => {
    api().getSettings.mockResolvedValue({ ok: true, value: { ...defaultSettings } })
    render(<SettingsView />)
  }

  it('saves changed settings', async () => {
    load()
    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('AI provider').value).toBe('off'))
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'claude' } })
    click('Save settings')
    expect((await screen.findByRole('status', { name: '' })).textContent).toBe('Saved')
    expect(api().saveSettings.mock.calls[0]?.[0]).toMatchObject({ aiProvider: 'claude' })
  })

  it('shows field errors', async () => {
    load()
    api().saveSettings.mockResolvedValue({
      ok: false,
      message: 'Please fix the highlighted fields.',
      errors: { ollamaUrl: 'The address must be on this laptop' }
    })
    await screen.findByLabelText('AI provider')
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save settings' }).disabled).toBe(false))
    click('Save settings')
    expect(await screen.findByText('The address must be on this laptop')).toBeTruthy()
  })

  it('saves a key without ever displaying it', async () => {
    load()
    const input = await screen.findByLabelText<HTMLInputElement>('API key')
    expect(input.type).toBe('password')
    fireEvent.change(input, { target: { value: 'sk-secret' } })
    api().getAiStatus.mockResolvedValue({ ok: true, value: { provider: 'claude', model: 'm', hasKey: true, blocked: '' } })
    click('Save key')
    expect(await screen.findByText('A key is saved')).toBeTruthy()
    expect(api().saveApiKey).toHaveBeenCalledWith('sk-secret')
    expect(document.body.textContent).not.toContain('sk-secret')
  })

  it('removes a key', async () => {
    api().getAiStatus.mockResolvedValue({ ok: true, value: { provider: 'claude', model: 'm', hasKey: true, blocked: '' } })
    load()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove key' }))
    await waitFor(() => expect(api().removeApiKey).toHaveBeenCalledOnce())
  })

  it('shows a rejected key', async () => {
    load()
    api().saveApiKey.mockResolvedValue({ ok: false, message: 'That does not look like an API key.' })
    fireEvent.change(await screen.findByLabelText('API key'), { target: { value: 'bad' } })
    click('Save key')
    expect((await screen.findByRole('alert')).textContent).toContain('does not look like')
  })

  it('shows exactly what was sent', async () => {
    api().getAiLog.mockResolvedValue({
      ok: true,
      value: [
        { id: 1, feature: 'Assistant', provider: 'claude', model: 'm', sent: 'The exact text', ok: true, inputTokens: 3, outputTokens: 2, createdAt: 'today' },
        { id: 2, feature: 'Daily tasks', provider: 'claude', model: 'm', sent: 'x', ok: false, inputTokens: 0, outputTokens: 0, createdAt: 'today' }
      ]
    })
    load()
    expect(await screen.findByText('The exact text')).toBeTruthy()
    expect(screen.getByText(/5 tokens/)).toBeTruthy()
    expect(screen.getByText(/failed/)).toBeTruthy()
  })
})
