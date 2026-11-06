import { useEffect, useState } from 'react'

/** Why AI cannot run right now, or an empty string when it can. */
export function useAiBlocked(): string {
  const [blocked, setBlocked] = useState('')

  useEffect(() => {
    void window.skillpilot.getAiStatus().then((result) => {
      setBlocked(result.ok ? result.value.blocked : result.message)
    })
  }, [])

  return blocked
}
