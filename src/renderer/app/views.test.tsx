import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Dashboard, SkillSummary } from '../../shared/progress'
import { Meter, ProofBadge, SkillChart } from './charts'
import { DashboardView } from './DashboardView'
import { GoalsView } from './GoalsView'
import { LinkPicker } from './LinkPicker'
import { ProjectsView } from './ProjectsView'
import { SkillsView } from './SkillsView'

const api = () => vi.mocked(window.skillpilot)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

const skill = (over: Partial<SkillSummary> = {}): SkillSummary => ({
  id: 1,
  name: 'React',
  category: 'technical',
  status: 'learning',
  claimed: 4,
  demonstrated: 2,
  proof: 'partly',
  evidenceCount: 1,
  history: [1, 4],
  ...over
})

const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  overall: 60,
  skills: [skill()],
  goals: [
    {
      id: 1,
      title: 'Become a developer',
      status: 'active',
      priority: 3,
      targetDate: '',
      progress: 60,
      milestonesDone: 1,
      milestonesTotal: 2,
      skillsMet: 0,
      skillsTotal: 1,
      missingSkills: ['React']
    }
  ],
  projects: [{ id: 1, name: 'App', status: 'complete', skills: [], milestonesDone: 0, milestonesTotal: 0 }],
  deadlines: [{ title: 'Late step', date: '2026-01-01', overdue: true }],
  achievements: [{ title: 'Reached Step', date: '2026-10-01' }],
  ...over
})

const withDashboard = (data = dashboard()) => api().getDashboard.mockResolvedValue({ ok: true, value: data })

describe('ProofBadge', () => {
  it.each([
    ['unproven', 'Unproven'],
    ['partly', 'Partly proven'],
    ['proven', 'Proven']
  ] as const)('labels %s in words', (proof, label) => {
    render(<ProofBadge proof={proof} />)
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('shows nothing for a skill with no level', () => {
    const { container } = render(<ProofBadge proof="none" />)
    expect(container.textContent).toBe('')
  })
})

describe('Meter', () => {
  it('exposes its value', () => {
    render(<Meter label="Goal" value={42} />)
    expect(screen.getByRole('progressbar', { name: 'Goal' }).getAttribute('aria-valuenow')).toBe('42')
  })
})

describe('SkillChart', () => {
  it('draws nothing without skills', () => {
    const { container } = render(<SkillChart skills={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('has a legend, and states each value in words', () => {
    render(<SkillChart skills={[skill()]} />)
    expect(screen.getByText('Claimed')).toBeTruthy()
    expect(screen.getByText('Demonstrated')).toBeTruthy()
    expect(screen.getByLabelText('React: claimed level 4 of 5').textContent).toBe('4')
    expect(screen.getByLabelText('React: demonstrated level 2 of 5').textContent).toBe('2')
  })

  it('sizes bars by level', () => {
    const { container } = render(<SkillChart skills={[skill()]} />)
    const bars = container.querySelectorAll<HTMLElement>('.level-bar')
    expect(bars[0]?.style.width).toBe('80%')
    expect(bars[1]?.style.width).toBe('40%')
  })
})

describe('DashboardView', () => {
  it('shows a prompt and no percentage when empty', async () => {
    withDashboard(dashboard({ overall: null, skills: [], goals: [], projects: [], deadlines: [], achievements: [] }))
    render(<DashboardView />)
    expect(await screen.findByText(/Add a skill, a goal, or a project/)).toBeTruthy()
    expect(screen.getByText('–')).toBeTruthy()
    expect(screen.getByText('Add an active goal to measure this')).toBeTruthy()
    expect(screen.getByText('No upcoming deadlines')).toBeTruthy()
  })

  it('shows progress, goals, skills, deadlines and achievements', async () => {
    withDashboard()
    render(<DashboardView />)
    expect(await screen.findByText('Overall progress')).toBeTruthy()
    expect(screen.getAllByText('60%')).toHaveLength(2)
    expect(screen.getByText('Become a developer')).toBeTruthy()
    expect(screen.getByText('Still needed: React')).toBeTruthy()
    expect(screen.getByText('React')).toBeTruthy()
    expect(screen.getByText('Overdue · 2026-01-01')).toBeTruthy()
    expect(screen.getByText('Reached Step')).toBeTruthy()
    expect(screen.getByText('1 complete')).toBeTruthy()
  })

  it('lists project progress with skills and milestones', async () => {
    withDashboard(
      dashboard({
        projects: [
          { id: 1, name: 'Portfolio', status: 'active', skills: ['React'], milestonesDone: 1, milestonesTotal: 3 },
          { id: 2, name: 'Idea', status: 'planned', skills: [], milestonesDone: 0, milestonesTotal: 0 }
        ]
      })
    )
    render(<DashboardView />)
    expect(await screen.findByText('Portfolio')).toBeTruthy()
    expect(screen.getByText('· React')).toBeTruthy()
    expect(screen.getByText('1 of 3 milestones · In progress')).toBeTruthy()
    expect(screen.getByText('Planned')).toBeTruthy()
  })

  it('leaves goals that are not active out of the goal list', async () => {
    const base = dashboard().goals[0]!
    withDashboard(dashboard({ goals: [{ ...base, status: 'paused' }] }))
    render(<DashboardView />)
    await screen.findByText('Overall progress')
    expect(screen.queryByText('Become a developer')).toBeNull()
  })

  it('explains how the numbers are worked out', async () => {
    withDashboard()
    render(<DashboardView />)
    expect(await screen.findByText('How these numbers are worked out')).toBeTruthy()
    expect(screen.getByText(/Demonstrated level comes only from evidence/)).toBeTruthy()
  })

  it('shows a message if data is unavailable', async () => {
    api().getDashboard.mockResolvedValue({ ok: false, message: 'Could not open.' })
    render(<DashboardView />)
    expect((await screen.findByRole('alert')).textContent).toBe('Could not open.')
  })
})

describe('LinkPicker', () => {
  const options = [
    { id: 1, values: { name: 'React' } },
    { id: 2, values: { name: 'SQL' } }
  ]
  const withOptions = () => api().listRecords.mockResolvedValue({ ok: true, value: options })
  const props = { parentId: 9, optionKind: 'skill', title: 'Required skills', emptyText: 'None yet.' } as const

  it('explains when there is nothing to link', async () => {
    render(<LinkPicker link="projectSkill" {...props} />)
    expect(await screen.findByText('None yet.')).toBeTruthy()
  })

  it('ticks what is already linked', async () => {
    withOptions()
    api().listLinks.mockResolvedValue({ ok: true, value: [{ id: 2, level: null }] })
    render(<LinkPicker link="projectSkill" {...props} />)
    expect((await screen.findByLabelText<HTMLInputElement>('SQL')).checked).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>('React').checked).toBe(false)
  })

  it('links and unlinks, then reports the change', async () => {
    withOptions()
    const onChange = vi.fn()
    render(<LinkPicker link="projectSkill" {...props} onChange={onChange} />)
    fireEvent.click(await screen.findByLabelText('React'))
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
    expect(api().setLink).toHaveBeenCalledExactlyOnceWith('projectSkill', 9, 1, true, undefined)
  })

  it('asks for a level on goal requirements, and saves changes to it', async () => {
    withOptions()
    api().listLinks.mockResolvedValue({ ok: true, value: [{ id: 1, level: 3 }] })
    render(<LinkPicker link="goalSkill" {...props} withLevel />)
    const level = await screen.findByLabelText<HTMLSelectElement>('Level needed for React')
    expect(level.value).toBe('3')
    expect(screen.queryByLabelText('Level needed for SQL')).toBeNull()
    fireEvent.change(level, { target: { value: '5' } })
    await waitFor(() => expect(api().setLink).toHaveBeenCalledWith('goalSkill', 9, 1, true, 5))
  })

  it('ticks at once, before saving has finished', async () => {
    withOptions()
    api().setLink.mockReturnValue(new Promise(() => undefined))
    render(<LinkPicker link="projectSkill" {...props} />)
    const box = await screen.findByLabelText<HTMLInputElement>('React')
    fireEvent.click(box)
    expect(box.checked).toBe(true)
  })

  it('undoes the tick if saving fails', async () => {
    withOptions()
    api().setLink.mockResolvedValue({ ok: false, message: 'Link failed.' })
    render(<LinkPicker link="projectSkill" {...props} />)
    const box = await screen.findByLabelText<HTMLInputElement>('React')
    fireEvent.click(box)
    await screen.findByRole('alert')
    await waitFor(() => expect(box.checked).toBe(false))
  })

  it('ignores an out-of-date answer', async () => {
    withOptions()
    let finishFirst: (value: { ok: true; value: { id: number; level: null }[] }) => void = () => undefined
    api().listLinks
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockReturnValueOnce(new Promise((done) => (finishFirst = done)))
      .mockResolvedValue({ ok: true, value: [{ id: 1, level: null }, { id: 2, level: null }] })
    render(<LinkPicker link="projectSkill" {...props} />)
    fireEvent.click(await screen.findByLabelText('React'))
    await waitFor(() => expect(api().listLinks).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByLabelText('SQL'))
    await waitFor(() => expect(api().listLinks).toHaveBeenCalledTimes(3))
    finishFirst({ ok: true, value: [{ id: 1, level: null }] })
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('SQL').checked).toBe(true))
  })

  it('shows a message when a link fails', async () => {
    withOptions()
    api().setLink.mockResolvedValue({ ok: false, message: 'Link failed.' })
    render(<LinkPicker link="projectSkill" {...props} />)
    fireEvent.click(await screen.findByLabelText('React'))
    expect((await screen.findByRole('alert')).textContent).toBe('Link failed.')
  })

  it('shows a message when links cannot load', async () => {
    withOptions()
    api().listLinks.mockResolvedValue({ ok: false, message: 'No links.' })
    render(<LinkPicker link="projectSkill" {...props} />)
    expect((await screen.findByRole('alert')).textContent).toBe('No links.')
  })
})

describe('SkillsView', () => {
  const stored = { id: 1, values: { name: 'React', category: 'technical', claimedLevel: '4', status: 'learning', notes: '' } }

  it('shows the chart and the list', async () => {
    withDashboard()
    api().listRecords.mockResolvedValue({ ok: true, value: [stored] })
    render(<SkillsView />)
    expect(await screen.findByText('Demonstrated')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Edit React' })).toBeTruthy()
  })

  it('expands to show level history and evidence for that skill', async () => {
    withDashboard()
    api().listRecords.mockResolvedValue({ ok: true, value: [stored] })
    render(<SkillsView />)
    await screen.findByText('Demonstrated')
    fireEvent.click(await screen.findByRole('button', { name: 'Details for React' }))
    expect(await screen.findByText(/My level over time: 1 → 4/)).toBeTruthy()
    expect(screen.getByText(/from 1 evidence item\./)).toBeTruthy()
    await waitFor(() => expect(api().listRecords).toHaveBeenCalledWith('evidence', 1))
  })

  it('refreshes the chart after a skill is added', async () => {
    render(<SkillsView />)
    click('Add skill')
    fireEvent.change(screen.getByLabelText(/Skill/), { target: { value: 'Go' } })
    const calls = api().getDashboard.mock.calls.length
    click('Save')
    await waitFor(() => expect(api().getDashboard.mock.calls.length).toBe(calls + 1))
  })
})

describe('GoalsView', () => {
  const stored = { id: 1, values: { title: 'Become a developer', status: 'active', priority: '3' } }

  it('expands to show progress, milestones, skills and projects', async () => {
    withDashboard()
    api().listRecords.mockImplementation((kind) =>
      Promise.resolve({ ok: true, value: kind === 'goal' ? [stored] : [] })
    )
    render(<GoalsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Become a developer' }))
    const item = screen.getByRole('listitem')
    expect(within(item).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60')
    expect(within(item).getByText('1 of 2 milestones, 0 of 1 skills')).toBeTruthy()
    expect(within(item).getByText('Still needed: React')).toBeTruthy()
    expect(within(item).getByText('Required skills')).toBeTruthy()
    expect(within(item).getByText('Related projects')).toBeTruthy()
    await waitFor(() => expect(api().listRecords).toHaveBeenCalledWith('goalMilestone', 1))
  })
})

describe('ProjectsView ideas', () => {
  it('asks the AI for project ideas and shows failures', async () => {
    api().getAiStatus.mockResolvedValue({ ok: true, value: { provider: 'claude', model: 'm', hasKey: true, blocked: '' } })
    api().suggestProjects.mockResolvedValue({ ok: false, message: 'Rate limited.' })
    render(<ProjectsView />)
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Suggest projects for my gaps' }).disabled).toBe(false)
    )
    click('Suggest projects for my gaps')
    expect((await screen.findByRole('alert')).textContent).toBe('Rate limited.')
  })

  it('disables ideas when AI is unavailable', async () => {
    api().getAiStatus.mockResolvedValue({ ok: true, value: { provider: 'off', model: '', hasKey: false, blocked: 'AI is off.' } })
    render(<ProjectsView />)
    expect(await screen.findByText('AI is off.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Suggest projects for my gaps' }).disabled).toBe(true)
  })
})

describe('ProjectsView', () => {
  it('expands to show skills and milestones', async () => {
    api().listRecords.mockImplementation((kind) =>
      Promise.resolve({ ok: true, value: kind === 'project' ? [{ id: 4, values: { name: 'App', status: 'active' } }] : [] })
    )
    render(<ProjectsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Details for App' }))
    expect(screen.getByText('Skills demonstrated')).toBeTruthy()
    await waitFor(() => expect(api().listRecords).toHaveBeenCalledWith('projectMilestone', 4))
    expect(api().listLinks).toHaveBeenCalledWith('projectSkill', 4)
  })
})
