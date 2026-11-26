import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ResumeData } from '../../shared/resume'
import { App } from './App'
import { ResumeView } from './ResumeView'

const api = () => vi.mocked(window.skillpilot)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

const tailored: ResumeData = {
  name: 'Asha <Rao>',
  headline: 'Frontend Developer',
  contact: ['asha@example.com'],
  summary: 'Frontend Developer skilled in React.',
  skills: [{ group: 'Technical', items: ['React', 'CSS'] }],
  experience: [{ heading: 'Intern', subheading: 'Initech', dates: 'Jun 2025 – Dec 2025', bullets: ['Built a dashboard', 'Fixed bugs'] }],
  projects: [{ heading: 'Site', subheading: 'React', dates: '', bullets: ['Personal site'] }],
  education: [],
  certifications: [],
  keywords: { matched: ['React', 'CSS'], missing: ['TypeScript'], coverage: 67 }
}

const job = { id: 4, values: { title: 'Frontend Developer', company: 'Acme' } }

describe('ResumeView', () => {
  it('builds a general resume and previews it with everything escaped', async () => {
    render(<ResumeView />)
    click('Build resume')
    await waitFor(() => expect(api().buildResume).toHaveBeenCalledWith(null))
    const preview = await screen.findByLabelText('Preview')
    expect(preview.textContent).toContain('Asha Rao')
    expect(preview.querySelector('script')).toBeNull()
  })

  it('tailors to a chosen job and shows the keyword check, warning against adding what is not true', async () => {
    api().listRecords.mockImplementation((kind) => Promise.resolve({ ok: true, value: kind === 'job' ? [job] : [] }))
    api().buildResume.mockResolvedValue({ ok: true, value: tailored })
    render(<ResumeView />)
    const choice = await screen.findByLabelText<HTMLSelectElement>('Tailor to')
    await waitFor(() => expect(choice.options).toHaveLength(2))
    fireEvent.change(choice, { target: { value: '4' } })
    click('Build resume')
    await waitFor(() => expect(api().buildResume).toHaveBeenCalledWith(4))
    expect(await screen.findByText('67%')).toBeTruthy()
    expect(screen.getByText(/Missing: TypeScript. Only add these, in Skills, if you really have them./)).toBeTruthy()
    expect((await screen.findByLabelText('Preview')).innerHTML).toContain('Asha &lt;Rao&gt;')
  })

  it('builds straight away for a job chosen on the Jobs screen', async () => {
    api().buildResume.mockResolvedValue({ ok: true, value: tailored })
    render(<ResumeView initialJobId={4} />)
    await waitFor(() => expect(api().buildResume).toHaveBeenCalledWith(4))
  })

  it('lets you edit, leave things out, and keeps the keyword check current', async () => {
    api().buildResume.mockResolvedValue({ ok: true, value: tailored })
    render(<ResumeView initialJobId={4} />)
    await screen.findByText('67%')
    click('Leave out CSS')
    expect(await screen.findByText('33%')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'New summary' } })
    fireEvent.change(screen.getByLabelText('Points for Intern at Initech'), { target: { value: 'One\nTwo\nThree' } })
    click('Leave out Site')
    click('Save version')
    await waitFor(() => expect(api().saveResume).toHaveBeenCalled())
    const [, title, saved] = api().saveResume.mock.calls[0]!
    expect(title).toBe('General resume')
    expect(saved).toMatchObject({ summary: 'New summary', projects: [], experience: [{ bullets: ['One', 'Two', 'Three'] }] })
  })

  it('shows suggestions from the local AI, and only accepted ones change the resume', async () => {
    api().buildResume.mockResolvedValue({ ok: true, value: tailored })
    api().polishResume.mockResolvedValue({
      ok: true,
      value: [
        { id: 'experience-0-0', section: 'experience', entry: 0, bullet: 0, original: 'Built a dashboard', reworded: 'Built an analytics dashboard in React' },
        { id: 'experience-0-1', section: 'experience', entry: 0, bullet: 1, original: 'Fixed bugs', reworded: 'Resolved 40 production bugs' }
      ]
    })
    render(<ResumeView initialJobId={4} />)
    await screen.findByText('67%')
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Suggest clearer wording' }).disabled).toBe(false))
    click('Suggest clearer wording')
    click(await screen.findByRole('button', { name: 'Accept: Built an analytics dashboard in React' }).then((b) => b.getAttribute('aria-label')!))
    click('Reject: Resolved 40 production bugs')
    expect((screen.getByLabelText('Points for Intern at Initech') as HTMLTextAreaElement).value).toBe('Built an analytics dashboard in React\nFixed bugs')
    expect(screen.queryByLabelText('Wording suggestions')).toBeNull()
  })

  it('needs the local AI for wording, and says why', async () => {
    api().getAiStatus.mockResolvedValue({ ok: true, value: { provider: 'ollama', model: 'm', localModels: null, blocked: 'Ollama is not running.' } })
    render(<ResumeView initialJobId={4} />)
    expect(await screen.findByText('Ollama is not running.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Suggest clearer wording' }).disabled).toBe(true)
  })

  it('exports PDF and text with the chosen template', async () => {
    api().exportResume.mockResolvedValue({ ok: true, value: 'C:\\Users\\me\\Documents\\Asha resume.pdf' })
    render(<ResumeView />)
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'compact' } })
    click('Build resume')
    await screen.findByLabelText('Preview')
    click('Export PDF')
    expect(await screen.findByText('Saved to C:\\Users\\me\\Documents\\Asha resume.pdf')).toBeTruthy()
    click('Export text')
    await waitFor(() => expect(api().exportResume).toHaveBeenLastCalledWith(expect.anything(), 'compact', 'txt'))
  })

  it('opens and deletes saved versions', async () => {
    api().listResumes.mockResolvedValue({ ok: true, value: [{ id: 3, jobId: null, title: 'General resume', createdAt: '2026-11-26 10:00' }] })
    api().getResume.mockResolvedValue({ ok: true, value: tailored })
    render(<ResumeView />)
    click(await screen.findByRole('button', { name: 'Open General resume from 2026-11-26 10:00' }).then((b) => b.getAttribute('aria-label')!))
    expect(await screen.findByLabelText('Preview')).toBeTruthy()
    click('Delete General resume from 2026-11-26 10:00')
    await waitFor(() => expect(api().deleteResume).toHaveBeenCalledWith(3))
  })

  it('shows a build problem', async () => {
    api().buildResume.mockResolvedValue({ ok: false, message: 'That job no longer exists.' })
    render(<ResumeView />)
    click('Build resume')
    expect((await screen.findByRole('alert')).textContent).toBe('That job no longer exists.')
  })
})

describe('from a job to its resume', () => {
  it('"Build a tailored resume" opens the builder for that job', async () => {
    api().listRecords.mockImplementation((kind) => Promise.resolve({ ok: true, value: kind === 'job' ? [job] : [] }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Jobs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Frontend Developer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Build a tailored resume' }))
    expect(await screen.findByRole('heading', { name: 'Resume', level: 1 })).toBeTruthy()
    await waitFor(() => expect(api().buildResume).toHaveBeenCalledWith(4))
  })
})
