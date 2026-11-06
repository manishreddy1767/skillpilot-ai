import { useEffect, useRef, type RefObject } from 'react'
import type { FieldErrors } from '../../shared/career'

/** Moves to the first invalid field, which may be scrolled out of view. */
export function useFocusFirstError(errors: FieldErrors): RefObject<HTMLFormElement | null> {
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  return form
}
