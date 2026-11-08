import type { FieldDef } from './career'

const onOff = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' }
]

const choices = (values: number[], unit = '') =>
  values.map((value) => ({ value: String(value), label: `${value}${unit}` }))

export const claudeModels = [
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5 (most capable)' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (balanced)' },
  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest)' }
]

const toggle = (key: string, label: string, initial = 'on'): FieldDef => ({
  key,
  column: key,
  label,
  type: 'select',
  options: onOff,
  initial
})

export const aiSettingFields: FieldDef[] = [
  {
    key: 'aiProvider',
    column: 'aiProvider',
    label: 'AI provider',
    type: 'select',
    initial: 'off',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'claude', label: 'Claude (Anthropic API)' },
      { value: 'ollama', label: 'Ollama (local, on this laptop)' }
    ]
  },
  {
    key: 'claudeModel',
    column: 'claudeModel',
    label: 'Claude model',
    type: 'select',
    initial: 'claude-opus-5-5',
    options: claudeModels
  },
  {
    key: 'ollamaUrl',
    column: 'ollamaUrl',
    label: 'Ollama address',
    type: 'url',
    initial: 'http://localhost:11434'
  },
  { key: 'ollamaModel', column: 'ollamaModel', label: 'Ollama model', type: 'text', initial: 'llama3.2' }
]

export const learningSettingFields: FieldDef[] = [
  {
    key: 'dailyMinutes',
    column: 'dailyMinutes',
    label: 'Time available each day',
    type: 'select',
    initial: '60',
    options: choices([15, 30, 45, 60, 90, 120, 180], ' minutes')
  },
  {
    key: 'weeklyMinutes',
    column: 'weeklyMinutes',
    label: 'Weekly learning target',
    type: 'select',
    initial: '300',
    options: choices([60, 120, 180, 300, 420, 600, 900], ' minutes')
  },
  {
    key: 'monthlyMinutes',
    column: 'monthlyMinutes',
    label: 'Monthly learning target',
    type: 'select',
    initial: '1200',
    options: choices([300, 600, 900, 1200, 1800, 2400, 3600], ' minutes')
  }
]

export const notificationSettingFields: FieldDef[] = [
  toggle('notifyReminders', 'Reminders I set on tasks'),
  toggle('notifyTasks', "Today's tasks unfinished"),
  toggle('notifyDeadlines', 'Upcoming deadlines'),
  toggle('notifyMilestones', 'Milestones reached'),
  toggle('notifyGaps', 'Missing skills for your target role'),
  toggle('notifySlowdown', 'Learning has slowed down'),
  toggle('notifyNextStep', 'A next step is available'),
  toggle('notifySummary', 'Weekly summary on Mondays'),
  {
    key: 'notifyDailyLimit',
    column: 'notifyDailyLimit',
    label: 'Most notifications a day',
    type: 'select',
    initial: '3',
    options: choices([1, 2, 3, 5, 10])
  },
  { key: 'quietStart', column: 'quietStart', label: 'Quiet hours start', type: 'time', initial: '22:00' },
  { key: 'quietEnd', column: 'quietEnd', label: 'Quiet hours end', type: 'time', initial: '08:00' }
]

export const widgetSettingFields: FieldDef[] = [
  {
    key: 'widgetSize',
    column: 'widgetSize',
    label: 'Widget size',
    type: 'select',
    initial: '72',
    options: choices([48, 56, 64, 72, 96, 128], ' px')
  },
  {
    key: 'widgetOpacity',
    column: 'widgetOpacity',
    label: 'Widget opacity',
    type: 'select',
    initial: '100',
    options: choices([30, 40, 50, 60, 70, 80, 90, 100], '%')
  },
  toggle('alwaysOnTop', 'Always on top'),
  toggle('clickThrough', 'Click-through mode', 'off'),
  toggle('startAtLogin', 'Start when I log in', 'off'),
  toggle('shortcuts', 'Keyboard shortcuts (Ctrl+Alt+Shift+S, Ctrl+Alt+Shift+O)')
]

export const settingFields: FieldDef[] = [
  ...aiSettingFields,
  ...learningSettingFields,
  ...notificationSettingFields,
  ...widgetSettingFields
]

export type Settings = Record<string, string>

export const defaultSettings: Settings = Object.fromEntries(
  settingFields.map((field) => [field.key, field.initial ?? ''])
)

/** Only addresses on this laptop, so "local" stays true. */
export function isLocalAddress(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value)
    return protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  } catch {
    return false
  }
}
