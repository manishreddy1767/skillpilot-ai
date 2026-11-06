import { useCallback, useEffect, useState } from 'react'
import type { Dashboard } from '../../shared/progress'

export function useDashboard(): { dashboard: Dashboard | null; message: string; reload: () => void } {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [message, setMessage] = useState('')

  const reload = useCallback((): void => {
    void window.skillpilot.getDashboard().then((result) => {
      if (result.ok) {
        setDashboard(result.value)
        setMessage('')
      } else {
        setMessage(result.message)
      }
    })
  }, [])

  useEffect(reload, [reload])

  return { dashboard, message, reload }
}
