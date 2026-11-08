import { useCallback, useEffect, useState } from 'react'
import type { BackupInfo } from '../../shared/ipc'

type Confirming = { action: 'import' } | { action: 'restore'; name: string } | null

export function DataSection() {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [eraseText, setEraseText] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback((): void => {
    void window.skillpilot.listBackups().then((result) => {
      if (result.ok) setBackups(result.value)
    })
  }, [])

  useEffect(load, [load])

  const report = (result: { ok: boolean; message?: string }, success: string): void => {
    setStatus(result.ok ? { ok: true, text: success } : { ok: false, text: result.message ?? 'That did not work.' })
    setConfirming(null)
    load()
  }

  const exportData = async (): Promise<void> => {
    const result = await window.skillpilot.exportData()
    if (result.ok && result.value === null) return
    report(result, result.ok ? `Saved to ${result.value}` : '')
  }

  const importData = async (): Promise<void> => {
    const result = await window.skillpilot.importData()
    if (result.ok && result.value === null) return setConfirming(null)
    report(result, 'Imported. Reloading…')
  }

  const restore = async (name: string): Promise<void> => {
    report(await window.skillpilot.restoreBackup(name), 'Restored. Reloading…')
  }

  const erase = async (): Promise<void> => {
    report(await window.skillpilot.eraseAll(eraseText), 'Everything was erased. Reloading…')
    setEraseText('')
  }

  return (
    <section>
      <h2>Your data</h2>
      <p className="lead">
        Everything stays on this laptop. A backup is made automatically before an import, restore, or erase.
      </p>

      <div className="actions tight">
        <button type="button" onClick={() => void exportData()}>
          Export my data
        </button>
        {confirming?.action === 'import' ? (
          <>
            <span>Importing replaces all your current data.</span>
            <button type="button" className="danger" onClick={() => void importData()}>
              Choose file and replace
            </button>
            <button type="button" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming({ action: 'import' })}>
            Import a file
          </button>
        )}
      </div>
      {status ? <p role={status.ok ? 'status' : 'alert'}>{status.text}</p> : null}

      <h3>Backups</h3>
      {backups.length === 0 ? <p className="lead">No backups yet.</p> : null}
      <ul className="plain wide-list">
        {backups.map((backup) => (
          <li key={backup.name}>
            <span>
              {new Date(backup.savedAt).toLocaleString()} · {backup.kind} · {backup.sizeKb} KB
            </span>
            {confirming?.action === 'restore' && confirming.name === backup.name ? (
              <span className="row-actions">
                <button type="button" className="danger" onClick={() => void restore(backup.name)}>
                  Replace current data
                </button>
                <button type="button" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Restore backup from ${new Date(backup.savedAt).toLocaleString()}`}
                onClick={() => setConfirming({ action: 'restore', name: backup.name })}
              >
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3>Erase everything</h3>
      <p className="lead">Removes all career data, settings, and the API key from this app. Type ERASE to confirm.</p>
      <div className="actions tight">
        <div className="field">
          <label htmlFor="erase-confirm">Confirmation</label>
          <input id="erase-confirm" value={eraseText} onChange={(event) => setEraseText(event.target.value)} />
        </div>
        <button type="button" className="danger" disabled={eraseText !== 'ERASE'} onClick={() => void erase()}>
          Erase everything
        </button>
      </div>
    </section>
  )
}
