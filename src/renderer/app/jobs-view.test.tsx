import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JobsView } from './JobsView'

const api = () => vi.mocked(window.skillpilot)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const job = { id: 7, values: { title: 'Frontend Developer', company: 'Acme', status: 'saved', url: 'https://www.linkedin.com/jobs/view/7', description: 'React' } }

describe('finding jobs', () => {
  it('starts from your first target role, and opens each site in the browser', async () => {
    api().listRecords.mockImplementation((kind) =>
      Promise.resolve({ ok: true, value: kind === 'targetRole' ? [{ id: 1, values: { title: 'Data Analyst' } }] : [] })
    )
    render(<JobsView />)
    await waitFor(() => expect((screen.getByLabelText('Job title or skills') as HTMLInputElement).value).toBe('Data Analyst'))
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Pune' } })
    for (const site of ['LinkedIn', 'Naukri', 'Indeed', 'Foundit']) click(`Search ${site}`)
    await waitFor(() => expect(api().searchJobs).toHaveBeenCalledTimes(4))
    expect(api().searchJobs.mock.calls.map((call) => call[0])).toEqual(['linkedin', 'naukri', 'indeed', 'foundit'])
    expect(api().searchJobs).toHaveBeenCalledWith('naukri', 'Data Analyst', 'Pune')
    expect(await screen.findByText(/Opened Foundit in your browser/)).toBeTruthy()
  })

  it('says plainly that SkillPilot sends nothing to job sites', () => {
    render(<JobsView />)
    expect(screen.getByText(/never signs in, reads, or sends anything to these sites/)).toBeTruthy()
  })

  it('needs something to search for', () => {
    render(<JobsView />)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Search LinkedIn' }).disabled).toBe(true)
  })

  it('shows when Chrome is missing', async () => {
    api().searchJobs.mockResolvedValueOnce({ ok: true, value: ' Chrome is not installed, so it opened in your default browser.' })
    render(<JobsView />)
    fireEvent.change(screen.getByLabelText('Job title or skills'), { target: { value: 'React' } })
    click('Search LinkedIn')
    expect(await screen.findByText(/Chrome is not installed/)).toBeTruthy()
  })
})

describe('importing and ranking', () => {
  it('imports a saved page and refreshes the list', async () => {
    api().importJobPage.mockResolvedValueOnce({ ok: true, value: 9 })
    render(<JobsView />)
    click('Import a saved job page')
    expect(await screen.findByText('Job imported. Check the details below.')).toBeTruthy()
    await waitFor(() => expect(api().rankJobs.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  it('shows an import problem, and nothing when cancelled', async () => {
    api().importJobPage.mockResolvedValueOnce({ ok: false, message: 'That file is empty.' })
    render(<JobsView />)
    click('Import a saved job page')
    expect((await screen.findByRole('alert')).textContent).toBe('That file is empty.')
  })

  it('ranks jobs by match, with what is missing', async () => {
    api().rankJobs.mockResolvedValue({
      ok: true,
      value: [{ id: 7, title: 'Frontend Developer', company: 'Acme', status: 'saved', score: 72, missing: ['CSS', 'Git'], entryLevel: true }]
    })
    render(<JobsView />)
    expect(await screen.findByText('72% match')).toBeTruthy()
    expect(screen.getByText('Missing: CSS, Git · Open to freshers')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Frontend Developer match' }).getAttribute('aria-valuenow')).toBe('72')
  })
})

describe('a job in detail', () => {
  const openDetails = async () => {
    api().listRecords.mockImplementation((kind) => Promise.resolve({ ok: true, value: kind === 'job' ? [job] : [] }))
    api().matchJob.mockResolvedValue({
      ok: true,
      value: {
        score: 55,
        skills: [
          { name: 'React', mentions: 2, essential: true, fit: 'proven', level: 3 },
          { name: 'CSS', mentions: 1, essential: true, fit: 'missing', level: 0 },
          { name: 'Jest', mentions: 1, essential: false, fit: 'claimed', level: 1 }
        ],
        missing: ['CSS'],
        experience: '1-3',
        entryLevel: false,
        role: null
      }
    })
    render(<JobsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Frontend Developer' }))
  }

  it('shows the match, split into essential and nice to have', async () => {
    await openDetails()
    expect(await screen.findByText('Asks for 1-3 years of experience')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Essential' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Nice to have' })).toBeTruthy()
    expect(screen.getByText('You have it, with proof, level 3')).toBeTruthy()
    expect(screen.getByText('Missing')).toBeTruthy()
  })

  it('suggests the missing skills, and opens the job in Chrome', async () => {
    await openDetails()
    await screen.findByText('Asks for 1-3 years of experience')
    click('Suggest the missing skills to learn')
    await waitFor(() => expect(api().suggestJobSkills).toHaveBeenCalledWith(7))
    click('Open job in Chrome')
    await waitFor(() => expect(api().openJobLink).toHaveBeenCalledWith(7))
  })
})
