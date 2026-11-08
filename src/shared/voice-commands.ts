import { addDays } from './learning'

/** The screens a spoken command can open. */
export type SectionId =
  | 'dashboard'
  | 'tasks'
  | 'assistant'
  | 'skills'
  | 'goals'
  | 'projects'
  | 'roles'
  | 'roadmaps'
  | 'profile'
  | 'education'
  | 'work'
  | 'certification'
  | 'settings'

export type VoiceIntent =
  | { kind: 'navigate'; section: SectionId; label: string }
  | { kind: 'addTask'; title: string; dueDate: string }
  | { kind: 'addSkill'; name: string }
  | { kind: 'addGoal'; title: string }
  | { kind: 'completeTask'; query: string }
  | { kind: 'whatsDue' }
  | { kind: 'minimize' }
  | { kind: 'ask'; text: string }

const SPOKEN_SECTIONS: [string[], SectionId, string][] = [
  [['dashboard', 'home', 'overview'], 'dashboard', 'Dashboard'],
  [['tasks', 'task', 'to do list', 'todo list', 'my tasks'], 'tasks', 'Tasks'],
  [['assistant', 'chat'], 'assistant', 'Assistant'],
  [['skills', 'skill', 'my skills'], 'skills', 'Skills'],
  [['goals', 'goal', 'my goals'], 'goals', 'Goals'],
  [['projects', 'project', 'my projects'], 'projects', 'Projects'],
  [['target roles', 'roles', 'target role'], 'roles', 'Target roles'],
  [['roadmaps', 'roadmap', 'road maps', 'road map'], 'roadmaps', 'Roadmaps'],
  [['profile', 'my profile'], 'profile', 'Profile'],
  [['education'], 'education', 'Education'],
  [['experience', 'work experience', 'work'], 'work', 'Experience'],
  [['certifications', 'certification', 'certificates'], 'certification', 'Certifications'],
  [['settings', 'preferences'], 'settings', 'Settings']
]

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }

/** Lower case, no punctuation, single spaces, and polite filler removed. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:please |hey skillpilot |ok skillpilot |skillpilot |can you |could you )+/, '')
    .replace(/(?: please| thanks| thank you)+$/, '')
    .trim()
}

/** Splits a trailing "tomorrow", "on friday", "next monday" or "in 3 days" from a phrase. */
export function splitDay(phrase: string, today: string): { rest: string; date: string } {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  const patterns: [RegExp, (match: RegExpMatchArray) => string][] = [
    [/\s+(?:due\s+)?today$/, () => today],
    [/\s+(?:due\s+)?tomorrow$/, () => addDays(today, 1)],
    [/\s+(?:due\s+)?next week$/, () => addDays(today, 7)],
    [
      /\s+(?:due\s+)?in (\d+|one|two|three|four|five|six|seven) days?$/,
      (m) => addDays(today, NUMBER_WORDS[m[1]!] ?? Number(m[1]))
    ],
    [
      /\s+(?:due\s+)?(?:on\s+)?(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/,
      (m) => {
        const ahead = (WEEKDAYS.indexOf(m[2]!) - weekday + 7) % 7 || 7
        return addDays(today, ahead + (m[1] ? 7 : 0) - (m[1] && ahead === 7 ? 7 : 0))
      }
    ]
  ]
  for (const [pattern, toDate] of patterns) {
    const match = phrase.match(pattern)
    if (match) return { rest: phrase.slice(0, match.index).trim(), date: toDate(match) }
  }
  return { rest: phrase, date: today }
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Turns recognised speech into one action. Anything unrecognised is passed on as a question. */
export function parseVoiceCommand(spoken: string, today: string): VoiceIntent {
  const text = normalise(spoken)

  const open = text.match(/^(?:open|go to|show(?: me)?|switch to|take me to)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:page|screen|section|tab))?$/)
  if (open) {
    const found = SPOKEN_SECTIONS.find(([names]) => names.includes(open[1]!))
    if (found) return { kind: 'navigate', section: found[1], label: found[2] }
  }

  if (/^(?:minimi[sz]e|hide (?:the )?(?:app|window)|close (?:the )?(?:app|window))$/.test(text)) return { kind: 'minimize' }

  if (/^(?:what(?:'s| is)? (?:due|on my list|planned)(?: today)?|what should i (?:do|learn|work on) today|(?:list|read) (?:my )?(?:today's )?tasks)$/.test(text)) {
    return { kind: 'whatsDue' }
  }

  // Windows dictation often hears "task" as "test", "tasks", "desk" or "tusk".
  const task =
    text.match(/^(?:add|create|new|make)(?: a)?(?: new)? (?:task|tasks|task's|test|desk|tusk)(?: to| for)?\s+(.+)$/) ??
    text.match(/^remind me to\s+(.+)$/)
  if (task) {
    const { rest, date } = splitDay(task[1]!, today)
    if (rest) return { kind: 'addTask', title: capitalise(rest), dueDate: date }
  }

  const skill = text.match(/^(?:add|create|new)(?: a)?(?: new)? skill\s+(.+)$/) ?? text.match(/^i(?:'m| am) learning\s+(.+)$/)
  if (skill) return { kind: 'addSkill', name: capitalise(skill[1]!) }

  const goal = text.match(/^(?:add|create|new|set)(?: a)?(?: new)? goal(?: to)?\s+(.+)$/)
  if (goal) return { kind: 'addGoal', title: capitalise(goal[1]!) }

  // Dictation often hears "mark" as "lark", "mock" or "marc", and "as done" as "is done".
  const done =
    text.match(
      /^(?:mark|lark|mock|marc|marked|tick off|tick|check off|complete|finish)\s+(?:the\s+)?(?:task\s+)?(.+?)(?:\s+(?:as|is))?(?:\s+(?:done|complete|completed|finished))?$/
    ) ??
    text.match(/^i(?:'ve| have)? (?:finished|completed|done)\s+(?:the\s+)?(?:task\s+)?(.+)$/) ??
    text.match(/^(?:the\s+)?(?:task\s+)?(.+?)\s+(?:is|are) (?:done|finished|complete|completed)$/)
  if (done && done[1]) return { kind: 'completeTask', query: done[1] }

  return { kind: 'ask', text: spoken.trim() }
}

/**
 * The open task a spoken name most likely means. An exact match wins, then the only title containing
 * the words. Null when nothing matches, or when several match equally, so the wrong task is never ticked.
 */
export function matchTitle(query: string, titles: string[]): number | null {
  const wanted = normalise(query)
  const plain = titles.map(normalise)
  const exact = plain.indexOf(wanted)
  if (exact >= 0) return exact

  const words = wanted.split(' ').filter((word) => word.length > 2)
  if (words.length === 0) return null
  const scores = plain.map((title) => words.filter((word) => title.includes(word)).length / words.length)
  const best = Math.max(...scores)
  if (best < 0.6) return null
  const winners = scores.flatMap((score, index) => (score === best ? [index] : []))
  return winners.length === 1 ? winners[0]! : null
}
