import type { FieldDef } from './career'

const onOff = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' }
]

const choices = (values: number[], unit = '') =>
  values.map((value) => ({ value: String(value), label: `${value}${unit}` }))

/** The widget's default size in pixels. Tests read it from here too. */
export const DEFAULT_WIDGET_SIZE = 64

/** The widget's microphone sits at its bottom-right, this share of the widget's size across. */
export const MIC_BADGE_RATIO = 0.38


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
    label: 'Local AI',
    type: 'select',
    initial: 'ollama',
    options: [
      { value: 'ollama', label: 'On, using Ollama on this laptop' },
      { value: 'off', label: 'Off' }
    ]
  },
  {
    key: 'ollamaUrl',
    column: 'ollamaUrl',
    label: 'Ollama address',
    type: 'url',
    initial: 'http://localhost:11434'
  },
  { key: 'ollamaModel', column: 'ollamaModel', label: 'Model', type: 'text', initial: 'qwen3:4b' }
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
    initial: String(DEFAULT_WIDGET_SIZE),
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

/** Windows' offline speech engines. The app passes the value straight to it, so only these are allowed. */
export const voiceLanguages = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' }
]

export const voiceSettingFields: FieldDef[] = [
  {
    key: 'voiceLanguage',
    column: 'voiceLanguage',
    label: 'Speech language',
    type: 'select',
    initial: 'en-US',
    options: voiceLanguages
  },
  toggle('voiceActNow', 'Carry out spoken requests straight away, including AI suggestions'),
  toggle('voiceReplies', 'Speak replies aloud')
]

export const settingFields: FieldDef[] = [
  ...aiSettingFields,
  ...voiceSettingFields,
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
