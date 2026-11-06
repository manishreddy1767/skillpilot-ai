import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecordEditor } from './RecordEditor'

const api = () => vi.mocked(window.skillpilot)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

const props = { title: 'Education', addLabel: 'Add education', emptyText: 'Nothing yet.' }
const record = {
  id: 7,
  values: {
    institution: 'State University',
    qualification: 'BSc',
    fieldOfStudy: '',
    startDate: '2020-09',
    endDate: '2024-06',
    notes: ''
  }
}
const withRecord = () => api().listRecords.mockResolvedValue({ ok: true, value: [record] })

describe('RecordEditor', () => {
  it('shows the empty message', async () => {
    render(<RecordEditor kind="education" {...props} />)
    expect(await screen.findByText('Nothing yet.')).toBeTruthy()
  })

  it('lists records with their details', async () => {
    withRecord()
    render(<RecordEditor kind="education" {...props} />)
    expect(await screen.findByText('State University')).toBeTruthy()
    expect(screen.getByText('BSc · 2020-09 to 2024-06')).toBeTruthy()
  })

  it('describes work as role at company', async () => {
    api().listRecords.mockResolvedValue({
      ok: true,
      value: [{ id: 1, values: { company: 'Acme', role: 'Developer', startDate: '', endDate: '' } }]
    })
    render(<RecordEditor kind="work" {...props} />)
    expect(await screen.findByText('Developer at Acme')).toBeTruthy()
  })

  it('adds a record and refreshes the list', async () => {
    render(<RecordEditor kind="education" {...props} />)
    await screen.findByText('Nothing yet.')
    click('Add education')
    type(/Institution/, 'State University')
    type(/Qualification/, 'BSc')
    withRecord()
    click('Save')
    expect(await screen.findByText('State University')).toBeTruthy()
    const [kind, id, values] = api().saveRecord.mock.calls[0]!
    expect([kind, id]).toEqual(['education', null])
    expect(values).toMatchObject({ institution: 'State University', qualification: 'BSc' })
    expect(screen.queryByLabelText(/Institution/)).toBeNull()
  })

  it('edits an existing record', async () => {
    withRecord()
    render(<RecordEditor kind="education" {...props} />)
    await screen.findByText('State University')
    click('Edit State University')
    expect(screen.getByLabelText<HTMLInputElement>(/Institution/).value).toBe('State University')
    type(/Institution/, 'New Name')
    click('Save')
    await waitFor(() => expect(api().saveRecord).toHaveBeenCalled())
    expect(api().saveRecord.mock.calls[0]?.[1]).toBe(7)
  })

  it('keeps the form open and shows errors when saving fails', async () => {
    api().saveRecord.mockResolvedValue({
      ok: false,
      message: 'Please fix the highlighted fields.',
      errors: { institution: 'Institution is required' }
    })
    render(<RecordEditor kind="education" {...props} />)
    await screen.findByText('Nothing yet.')
    click('Add education')
    click('Save')
    expect(await screen.findByText('Institution is required')).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(/Institution/))
  })

  it('cancel discards the form', async () => {
    render(<RecordEditor kind="education" {...props} />)
    await screen.findByText('Nothing yet.')
    click('Add education')
    type(/Institution/, 'Half typed')
    click('Cancel')
    expect(screen.queryByLabelText(/Institution/)).toBeNull()
    expect(api().saveRecord).not.toHaveBeenCalled()
  })

  it('asks before deleting', async () => {
    withRecord()
    render(<RecordEditor kind="education" {...props} />)
    await screen.findByText('State University')
    click('Delete State University')
    expect(api().deleteRecord).not.toHaveBeenCalled()
    click('Keep')
    expect(api().deleteRecord).not.toHaveBeenCalled()
    click('Delete State University')
    api().listRecords.mockResolvedValue({ ok: true, value: [] })
    click('Yes, delete')
    expect(await screen.findByText('Nothing yet.')).toBeTruthy()
    expect(api().deleteRecord).toHaveBeenCalledExactlyOnceWith('education', 7)
  })

  it('shows a message when records cannot load', async () => {
    api().listRecords.mockResolvedValue({ ok: false, message: 'Could not open.' })
    render(<RecordEditor kind="education" {...props} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Could not open.')
  })

  it('shows a message when a delete fails', async () => {
    withRecord()
    api().deleteRecord.mockResolvedValue({ ok: false, message: 'Delete failed.' })
    render(<RecordEditor kind="education" {...props} />)
    await screen.findByText('State University')
    click('Delete State University')
    click('Yes, delete')
    expect((await screen.findByRole('alert')).textContent).toBe('Delete failed.')
  })
})
