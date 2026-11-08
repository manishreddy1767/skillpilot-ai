import { describe, expect, it } from 'vitest'
import { matchTitle, normalise, parseVoiceCommand, splitDay } from './voice-commands'

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

  it.each(['Am I ready for a junior developer role?', 'open the pod bay doors', 'add task', 'mark'])(
    'passes "%s" on as a question',
    (text) => {
      expect(parse(text)).toEqual({ kind: 'ask', text })
    }
  )
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
