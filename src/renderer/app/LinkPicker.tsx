import { useCallback, useEffect, useState } from 'react'
import type { Link, LinkKind, StoredRecord } from '../../shared/career'
import { MAX_LEVEL } from '../../shared/progress'

interface LinkPickerProps {
  link: LinkKind
  parentId: number
  /** What can be linked. */
  optionKind: 'skill' | 'project'
  title: string
  emptyText: string
  /** Also asks for the level needed, for goal requirements. */
  withLevel?: boolean
  onChange?: () => void
}

const DEFAULT_LEVEL = 3
const levels = Array.from({ length: MAX_LEVEL }, (_value, index) => index + 1)

export function LinkPicker({ link, parentId, optionKind, title, emptyText, withLevel, onChange }: LinkPickerProps) {
  const [options, setOptions] = useState<StoredRecord[]>([])
  const [linked, setLinked] = useState<Link[]>([])
  const [message, setMessage] = useState('')

  const load = useCallback(async (): Promise<void> => {
    const [records, current] = await Promise.all([
      window.skillpilot.listRecords(optionKind),
      window.skillpilot.listLinks(link, parentId)
    ])
    if (records.ok) setOptions(records.value)
    if (current.ok) setLinked(current.value)
    if (!records.ok) setMessage(records.message)
    else if (!current.ok) setMessage(current.message)
  }, [link, optionKind, parentId])

  useEffect(() => {
    void load()
  }, [load])

  const update = async (id: number, on: boolean, level?: number): Promise<void> => {
    const result = await window.skillpilot.setLink(link, parentId, id, on, level)
    if (result.ok) {
      setMessage('')
      await load()
      onChange?.()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <fieldset className="links">
      <legend>{title}</legend>
      {options.length === 0 ? <p className="lead">{emptyText}</p> : null}
      {options.map((option) => {
        const name = option.values['name'] ?? ''
        const current = linked.find((item) => item.id === option.id)
        return (
          <div className="link-row" key={option.id}>
            <label>
              <input
                type="checkbox"
                checked={Boolean(current)}
                onChange={(event) =>
                  void update(option.id, event.target.checked, withLevel ? DEFAULT_LEVEL : undefined)
                }
              />
              {name}
            </label>
            {withLevel && current ? (
              <select
                aria-label={`Level needed for ${name}`}
                value={current.level ?? DEFAULT_LEVEL}
                onChange={(event) => void update(option.id, true, Number(event.target.value))}
              >
                {levels.map((level) => (
                  <option key={level} value={level}>
                    Level {level}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        )
      })}
      {message ? <p role="alert">{message}</p> : null}
    </fieldset>
  )
}
