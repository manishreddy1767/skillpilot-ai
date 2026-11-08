import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DataSection } from './DataSection'

const api = () => vi.mocked(window.skillpilot)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const backup = { name: 'skillpilot-2026-11-07.db', kind: 'daily' as const, savedAt: '2026-11-07T10:00:00.000Z', sizeKb: 48 }

describe('DataSection', () => {
  it('exports and says where', async () => {
    api().exportData.mockResolvedValue({ ok: true, value: 'C:/x/export.json' })
    render(<DataSection />)
    click('Export my data')
    expect((await screen.findByRole('status')).textContent).toBe('Saved to C:/x/export.json')
  })

  it('says nothing when export is cancelled', async () => {
    api().exportData.mockResolvedValue({ ok: true, value: null })
    render(<DataSection />)
    click('Export my data')
    await waitFor(() => expect(api().exportData).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('asks before importing, and imports only when confirmed', async () => {
    api().importData.mockResolvedValue({ ok: true, value: 'C:/x/export.json' })
    render(<DataSection />)
    click('Import a file')
    expect(api().importData).not.toHaveBeenCalled()
    expect(screen.getByText('Importing replaces all your current data.')).toBeTruthy()
    click('Choose file and replace')
    expect((await screen.findByRole('status')).textContent).toContain('Imported')
  })

  it('cancels an import', () => {
    render(<DataSection />)
    click('Import a file')
    click('Cancel')
    expect(api().importData).not.toHaveBeenCalled()
  })

  it('shows why an import failed', async () => {
    api().importData.mockResolvedValue({ ok: false, message: 'That file is damaged.' })
    render(<DataSection />)
    click('Import a file')
    click('Choose file and replace')
    expect((await screen.findByRole('alert')).textContent).toBe('That file is damaged.')
  })

  it('lists backups and restores one after confirming', async () => {
    api().listBackups.mockResolvedValue({ ok: true, value: [backup] })
    render(<DataSection />)
    fireEvent.click(await screen.findByRole('button', { name: /Restore backup from/ }))
    expect(api().restoreBackup).not.toHaveBeenCalled()
    click('Replace current data')
    await waitFor(() => expect(api().restoreBackup).toHaveBeenCalledWith(backup.name))
  })

  it('says when there are no backups', async () => {
    render(<DataSection />)
    expect(await screen.findByText('No backups yet.')).toBeTruthy()
  })

  it('erases only after typing ERASE', async () => {
    render(<DataSection />)
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Erase everything' })
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Confirmation'), { target: { value: 'erase' } })
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Confirmation'), { target: { value: 'ERASE' } })
    fireEvent.click(button)
    await waitFor(() => expect(api().eraseAll).toHaveBeenCalledWith('ERASE'))
  })
})
