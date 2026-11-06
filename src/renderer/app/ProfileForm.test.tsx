import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { profileFields } from '../../shared/career'
import { ProfileForm } from './ProfileForm'

const api = () => vi.mocked(window.skillpilot)
const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const ready = () => waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(false))
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

describe('ProfileForm', () => {
  it('shows an input for every field', async () => {
    render(<ProfileForm />)
    await ready()
    for (const field of profileFields) expect(screen.getByLabelText(new RegExp(field.label))).toBeTruthy()
  })

  it('loads the saved profile', async () => {
    api().getProfile.mockResolvedValue({ ok: true, value: { fullName: 'Sam Doe' } })
    render(<ProfileForm />)
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>(/Full name/).value).toBe('Sam Doe'))
  })

  it('saves what was typed and confirms', async () => {
    render(<ProfileForm />)
    await ready()
    type(/Full name/, 'Sam')
    type(/Current goal/, 'Ship it')
    save()
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(api().saveProfile.mock.calls[0]?.[0]).toMatchObject({ fullName: 'Sam', currentGoal: 'Ship it' })
  })

  it('shows field errors from the main process', async () => {
    api().saveProfile.mockResolvedValue({
      ok: false,
      message: 'Please fix the highlighted fields.',
      errors: { fullName: 'Full name is required' }
    })
    render(<ProfileForm />)
    await ready()
    save()
    expect(await screen.findByText('Full name is required')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Please fix')
    expect(screen.getByLabelText(/Full name/).getAttribute('aria-invalid')).toBe('true')
  })

  it('moves focus to the first invalid field', async () => {
    api().saveProfile.mockResolvedValue({
      ok: false,
      message: 'Please fix the highlighted fields.',
      errors: { email: 'Enter a valid email address', summary: 'Too long' }
    })
    render(<ProfileForm />)
    await ready()
    save()
    await screen.findByText('Enter a valid email address')
    expect(document.activeElement).toBe(screen.getByLabelText(/Email/))
  })

  it('clears the saved message on the next edit', async () => {
    render(<ProfileForm />)
    await ready()
    save()
    await screen.findByRole('status')
    type(/Headline/, 'x')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('blocks saving if the profile could not load, so nothing is overwritten', async () => {
    api().getProfile.mockResolvedValue({ ok: false, message: 'Your data could not be opened.' })
    render(<ProfileForm />)
    expect((await screen.findByRole('alert')).textContent).toContain('could not be opened')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save profile' }).disabled).toBe(true)
  })
})
