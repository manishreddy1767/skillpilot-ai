import { describe, expect, it } from 'vitest'
import { FIXED_PHRASES, SPOKEN_SECTION_NAMES, matchTitle, normalise, parseVoiceCommand, splitDay } from './voice-commands'

// A Sunday.
const today = '2026-11-08'
const parse = (text: string) => parseVoiceCommand(text, today)

describe('normalise', () => {
  it('lowercases, drops punctuation, and removes polite filler', () => {
    expect(normalise('  Please, OPEN the Tasks page! Thanks.')).toBe('open the tasks page')
    expect(normalise('Hey SkillPilot, add task X please')).toBe('add task x')
  })
})

describe('splitDay', () => {
  it.each([
    ['read chapter', 'read chapter', today],
    ['read chapter today', 'read chapter', today],
    ['read chapter tomorrow', 'read chapter', '2026-11-09'],
    ['read chapter due tomorrow', 'read chapter', '2026-11-09'],
    ['read chapter next week', 'read chapter', '2026-11-15'],
    ['read chapter in 3 days', 'read chapter', '2026-11-11'],
    ['read chapter in two days', 'read chapter', '2026-11-10'],
    ['read chapter on friday', 'read chapter', '2026-11-13'],
    ['read chapter friday', 'read chapter', '2026-11-13'],
    ['read chapter on sunday', 'read chapter', '2026-11-15'],
    ['read chapter next monday', 'read chapter', '2026-11-16']
  ])('"%s" becomes "%s" on %s', (phrase, rest, date) => {
    expect(splitDay(phrase, today)).toEqual({ rest, date })
  })
})

describe('parseVoiceCommand', () => {
  it.each([
    ['open tasks', 'tasks'],
    ['Go to my skills', 'skills'],
    ['show me the dashboard', 'dashboard'],
    ['open target roles', 'roles'],
    ['open work experience', 'work'],
    ['switch to settings', 'settings'],
    ['open the road map page', 'roadmaps']
  ])('"%s" opens %s', (text, section) => {
    expect(parse(text)).toMatchObject({ kind: 'navigate', section })
  })

  it('adds a task, with its day', () => {
    expect(parse('Add task read chapter four tomorrow')).toEqual({ kind: 'addTask', title: 'Read chapter four', dueDate: '2026-11-09' })
    expect(parse('create a new task to practise SQL')).toEqual({ kind: 'addTask', title: 'Practise sql', dueDate: today })
    expect(parse('remind me to call the mentor on friday')).toEqual({ kind: 'addTask', title: 'Call the mentor', dueDate: '2026-11-13' })
  })

  it.each(['Add test read chapter tomorrow', 'add desk read chapter tomorrow', 'add tasks read chapter tomorrow'])(
    'copes with Windows mishearing "task" in "%s"',
    (text) => {
      expect(parse(text)).toEqual({ kind: 'addTask', title: 'Read chapter', dueDate: '2026-11-09' })
    }
  )

  it('adds a skill and a goal', () => {
    expect(parse('add skill docker')).toEqual({ kind: 'addSkill', name: 'Docker' })
    expect(parse("I'm learning TypeScript")).toEqual({ kind: 'addSkill', name: 'Typescript' })
    expect(parse('set a goal to get a junior role')).toEqual({ kind: 'addGoal', title: 'Get a junior role' })
  })

  it.each([
    ['mark read chapter done', 'read chapter'],
    ['mark the task read chapter as complete', 'read chapter'],
    ['tick off read chapter', 'read chapter'],
    ['I finished read chapter', 'read chapter'],
    ["I've completed the task practise sql", 'practise sql'],
    ['complete practise sql', 'practise sql'],
    ['Lark the testing guide is done', 'testing guide'],
    ['mock read chapter as done', 'read chapter'],
    ['the testing guide is done', 'testing guide'],
    ['practise sql is finished', 'practise sql']
  ])('"%s" completes "%s"', (text, query) => {
    expect(parse(text)).toEqual({ kind: 'completeTask', query })
  })

  it.each(["what's due today", 'what is due', 'what should I do today', 'read my tasks'])('"%s" lists what is due', (text) => {
    expect(parse(text)).toEqual({ kind: 'whatsDue' })
  })

  it('minimises', () => {
    expect(parse('minimise')).toEqual({ kind: 'minimize' })
    expect(parse('hide the app')).toEqual({ kind: 'minimize' })
  })

  it.each(['Am I ready for a junior developer role?', 'add task', 'mark', 'tell me a joke'])(
    'passes "%s" on as a question',
    (text) => {
      expect(parse(text)).toEqual({ kind: 'ask', text })
    }
  )
})

describe('desktop commands', () => {
  it.each([
    ['open chrome', { kind: 'open', target: 'chrome' }],
    ['launch vs code', { kind: 'open', target: 'vs code' }],
    ['Open YouTube in Chrome', { kind: 'open', target: 'youtube', browser: 'chrome' }],
    ['go to example.com using edge', { kind: 'open', target: 'example com', browser: 'edge' }],
    ['open the pod bay doors', { kind: 'open', target: 'pod bay doors' }],
    ['search for react hooks', { kind: 'search', query: 'react hooks', site: 'google' }],
    ['google best laptops 2026', { kind: 'search', query: 'best laptops 2026', site: 'google' }],
    ['search lofi music on youtube', { kind: 'search', query: 'lofi music', site: 'youtube' }],
    ['play arijit singh songs', { kind: 'search', query: 'arijit singh songs', site: 'youtube' }],
    ['play lofi on youtube in chrome', { kind: 'search', query: 'lofi', site: 'youtube', browser: 'chrome' }],
    ['look up typescript generics in edge', { kind: 'search', query: 'typescript generics', site: 'google', browser: 'edge' }],
    ['volume up', { kind: 'volume', change: 'up' }],
    ['turn the volume down', { kind: 'volume', change: 'down' }],
    ['increase volume', { kind: 'volume', change: 'up' }],
    ['mute', { kind: 'volume', change: 'mute' }],
    ['lock my computer', { kind: 'lock' }],
    ['what time is it', { kind: 'time' }],
    ["what's the date today", { kind: 'date' }]
  ])('"%s"', (text, intent) => {
    expect(parse(text)).toEqual(intent)
  })

  it.each(FIXED_PHRASES)('the engine listens for "%s", and it is understood as a command', (phrase) => {
    expect(parse(phrase).kind).not.toBe('ask')
  })

  it.each(SPOKEN_SECTION_NAMES)('"open %s" opens a SkillPilot section', (name) => {
    expect(parse(`open ${name}`).kind).toBe('navigate')
  })

  it('still opens SkillPilot sections before anything outside', () => {
    expect(parse('open settings')).toMatchObject({ kind: 'navigate', section: 'settings' })
    expect(parse('open my tasks')).toMatchObject({ kind: 'navigate', section: 'tasks' })
  })
})

describe('matchTitle', () => {
  const titles = ['Read chapter four', 'Practise SQL joins', 'Read the testing guide']

  it('prefers an exact match', () => {
    expect(matchTitle('read chapter four', titles)).toBe(0)
  })

  it('finds the only title containing the words', () => {
    expect(matchTitle('sql joins', titles)).toBe(1)
    expect(matchTitle('the testing guide', titles)).toBe(2)
  })

  it('refuses when several match equally, so the wrong task is never ticked', () => {
    expect(matchTitle('read', ['Read chapter four', 'Read the testing guide'])).toBeNull()
  })

  it('refuses a weak match', () => {
    expect(matchTitle('cooking dinner', titles)).toBeNull()
    expect(matchTitle('a', titles)).toBeNull()
  })
})
