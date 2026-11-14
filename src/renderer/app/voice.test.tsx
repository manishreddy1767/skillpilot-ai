import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VoiceOutcome, VoiceStatus } from '../../shared/ipc'
import { Overview } from '../overview/Overview'
import { Widget } from '../widget/Widget'
import { App } from './App'
import { AssistantView } from './AssistantView'

const api = () => vi.mocked(window.skillpilot)
const outcome = (value: VoiceOutcome) => api().listen.mockResolvedValueOnce({ ok: true, value })
const mic = () => screen.getByRole('button', { name: 'Speak a message or command' })
const ready = () =>
  api().getAiStatus.mockResolvedValue({ ok: true, value: { provider: 'claude', model: 'm', hasKey: true, blocked: '' } })

/** Captures the status listener a component registers, so tests can play the main process. */
function statusFeed() {
  const listeners: ((status: VoiceStatus) => void)[] = []
  api().onVoiceStatus.mockImplementation((listener) => {
    listeners.push(listener)
    return () => undefined
  })
  return (status: VoiceStatus) => act(() => listeners.forEach((listener) => listener(status)))
}

describe('the microphone in the chat bar', () => {
  it('sits in the input bar with Send, and shows listening with a level meter', async () => {
    const send = statusFeed()
    let finish: (value: { ok: true; value: VoiceOutcome }) => void = () => undefined
    api().listen.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const { container } = render(<AssistantView />)
    const bar = screen.getByLabelText('Your message').closest('.composer')!
    expect(bar.contains(mic())).toBe(true)
    expect(bar.contains(screen.getByRole('button', { name: 'Send' }))).toBe(true)

    fireEvent.click(mic())
    expect(await screen.findByText('Starting the microphone…')).toBeTruthy()
    send({ phase: 'listening', level: 25 })
    expect(screen.getByText('Listening… speak now.')).toBeTruthy()
    expect(container.querySelectorAll('.level-meter .on')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Stop listening' }).getAttribute('aria-pressed')).toBe('true')
    send({ phase: 'working', heard: 'open chrome' })
    expect(screen.getByText('Heard "open chrome". Working on it…')).toBeTruthy()
    await act(async () => finish({ ok: true, value: { heard: 'open chrome', reply: 'Opening Google Chrome.' } }))
    expect(await screen.findByText('Heard "open chrome". Opening Google Chrome.')).toBeTruthy()
  })

  it('ignores voice updates meant for the widget', () => {
    const send = statusFeed()
    render(<AssistantView />)
    send({ phase: 'listening', level: 40 })
    expect(screen.queryByText('Listening… speak now.')).toBeNull()
  })

  it('says when nothing was heard', async () => {
    outcome({ heard: '', reply: "I didn't hear anything. Press the microphone and speak again." })
    render(<AssistantView />)
    fireEvent.click(mic())
    expect(await screen.findByText(/I didn't hear anything/)).toBeTruthy()
  })

  it('puts unsure speech in the box to check', async () => {
    outcome({ heard: 'in the senate', draft: 'in the senate', reply: "I'm not sure I heard that right." })
    render(<AssistantView />)
    fireEvent.click(mic())
    expect(await screen.findByText(/not sure I heard that right/)).toBeTruthy()
    expect((screen.getByLabelText('Your message') as HTMLTextAreaElement).value).toBe('in the senate')
  })

  it('sends a spoken question to the assistant and applies its suggestions', async () => {
    ready()
    outcome({ heard: 'What should I learn next?', ask: 'What should I learn next?', reply: 'Let me ask the assistant.' })
    const proposal = { id: 9, kind: 'addSkill' as const, summary: 'Add skill: Go', details: [] }
    const old = { ...proposal, id: 4, summary: 'Older one' }
    api().listProposals.mockResolvedValueOnce({ ok: true, value: [] })
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

  it('minimises when asked', async () => {
    outcome({ heard: 'minimise', minimize: true, reply: 'Minimising to the widget.' })
    render(<AssistantView />)
    fireEvent.click(mic())
    await waitFor(() => expect(api().minimizeToWidget).toHaveBeenCalled())
  })

  it('shows a microphone problem plainly', async () => {
    api().listen.mockResolvedValueOnce({ ok: false, message: 'No microphone could be used.' })
    render(<AssistantView />)
    fireEvent.click(mic())
    expect((await screen.findByRole('alert')).textContent).toBe('No microphone could be used.')
  })

  it('the stop button stops listening and ignores anything heard late', async () => {
    let finish: (value: { ok: true; value: VoiceOutcome }) => void = () => undefined
    api().listen.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    render(<AssistantView />)
    fireEvent.click(mic())
    fireEvent.click(await screen.findByRole('button', { name: 'Stop listening' }))
    await waitFor(() => expect(api().stopListening).toHaveBeenCalled())
    await act(async () => finish({ ok: true, value: { heard: 'open chrome', reply: 'Opening Google Chrome.' } }))
    expect(screen.queryByText(/Opening Google Chrome/)).toBeNull()
    expect(mic()).toBeTruthy()
  })

  it('stops the microphone when leaving the screen mid-listen', async () => {
    api().listen.mockReturnValueOnce(new Promise(() => undefined))
    const { unmount } = render(<AssistantView />)
    fireEvent.click(mic())
    await screen.findByRole('button', { name: 'Stop listening' })
    unmount()
    expect(api().stopListening).toHaveBeenCalled()
  })

  it('"open my skills" switches screens and says why', async () => {
    outcome({ heard: 'open my skills', navigate: 'skills', reply: 'Opening Skills.' })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Assistant' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Speak a message or command' }))
    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeTruthy()
    expect(screen.getByText('Heard "open my skills". Opening Skills.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Opening Skills/)).toBeNull()
  })
})

describe('requests spoken to the widget, arriving in the app', () => {
  it('says it is ready only after listening for them', () => {
    render(<App />)
    expect(api().onNavigate).toHaveBeenCalled()
    expect(api().onVoiceAsk).toHaveBeenCalled()
    expect(api().appReady).toHaveBeenCalledOnce()
    const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0]!
    expect(order(api().appReady)).toBeGreaterThan(order(api().onNavigate))
  })

  it('opens the section the widget was asked for', async () => {
    let navigate: (section: string, note: string) => void = () => undefined
    api().onNavigate.mockImplementation((listener) => {
      navigate = listener as never
      return () => undefined
    })
    render(<App />)
    act(() => navigate('tasks', 'Heard "open my tasks". Opening Tasks.'))
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeTruthy()
    expect(screen.getByText('Heard "open my tasks". Opening Tasks.')).toBeTruthy()
  })

  it('puts a question to the assistant once, and applies its suggestions', async () => {
    ready()
    let askAssistant: (text: string) => void = () => undefined
    api().onVoiceAsk.mockImplementation((listener) => {
      askAssistant = listener
      return () => undefined
    })
    render(<App />)
    act(() => askAssistant('Am I ready for a junior role?'))
    expect(await screen.findByRole('heading', { name: 'Assistant' })).toBeTruthy()
    await waitFor(() => expect(api().sendChat).toHaveBeenCalledExactlyOnceWith('Am I ready for a junior role?'))
    expect(screen.getByText('Heard "Am I ready for a junior role?".')).toBeTruthy()
  })
})

describe('the microphone beside the robot', () => {
  it('sits on the widget, apart from the robot, and starts listening', () => {
    render(<Widget />)
    const robot = screen.getByRole('button', { name: 'SkillPilot AI' })
    const micButton = screen.getByRole('button', { name: 'Talk to SkillPilot' })
    expect(robot.contains(micButton)).toBe(false)
    expect(micButton.style.width).toBe('38%')
    fireEvent.pointerDown(micButton, { button: 0 })
    fireEvent.click(micButton)
    expect(api().widgetListen).toHaveBeenCalledOnce()
    expect(api().dragPress).not.toHaveBeenCalled()
  })

  it('turns into a stop button while listening, and back after', () => {
    const send = statusFeed()
    render(<Widget />)
    send({ phase: 'listening', level: 10 })
    const stop = screen.getByRole('button', { name: 'Stop listening' })
    expect(stop.getAttribute('aria-pressed')).toBe('true')
    expect(stop.className).toContain('listening')
    send({ phase: 'done', heard: 'open chrome', reply: 'Opening Google Chrome.' })
    expect(screen.getByRole('button', { name: 'Talk to SkillPilot' })).toBeTruthy()
  })

  it('hovering anywhere on the widget, including the microphone, shows the panel', () => {
    render(<Widget />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Talk to SkillPilot' }).parentElement!)
    expect(api().hoverEnter).toHaveBeenCalled()
  })
})

describe('the hover panel talking back', () => {
  it('shows listening with a level, then what was heard and done', () => {
    const send = statusFeed()
    const { container } = render(<Overview />)
    expect(screen.queryByText('Voice')).toBeNull()
    send({ phase: 'listening', level: 40 })
    expect(screen.getByText('Listening… speak now.')).toBeTruthy()
    expect(container.querySelectorAll('.voice-card .meter .on')).toHaveLength(4)
    send({ phase: 'done', heard: 'open youtube in chrome', reply: 'Opening Youtube in Chrome.' })
    expect(screen.getByText('“open youtube in chrome”')).toBeTruthy()
    expect(screen.getByText('Opening Youtube in Chrome.')).toBeTruthy()
    send({ phase: 'idle' })
    expect(screen.queryByText('Voice')).toBeNull()
  })

  it('marks a failure', () => {
    const send = statusFeed()
    const { container } = render(<Overview />)
    send({ phase: 'done', reply: 'No microphone could be used.', failed: true })
    expect(container.querySelector('.voice-card.failed')).toBeTruthy()
  })
})
