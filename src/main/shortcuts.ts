export const SHORTCUTS = {
  // Ctrl+Alt+S alone is often taken by other apps, which this laptop showed.
  toggleWidget: 'Control+Alt+Shift+S',
  openApp: 'Control+Alt+Shift+O'
} as const

export interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

/**
 * Registers the global shortcuts, or removes them when turned off. Returns any that another app already
 * holds, so the caller can report them rather than fail silently.
 */
export function applyShortcuts(
  registry: ShortcutRegistry,
  enabled: boolean,
  actions: { toggleWidget(): void; openApp(): void }
): string[] {
  for (const accelerator of Object.values(SHORTCUTS)) registry.unregister(accelerator)
  if (!enabled) return []
  const failed: string[] = []
  if (!registry.register(SHORTCUTS.toggleWidget, actions.toggleWidget)) failed.push(SHORTCUTS.toggleWidget)
  if (!registry.register(SHORTCUTS.openApp, actions.openApp)) failed.push(SHORTCUTS.openApp)
  return failed
}
