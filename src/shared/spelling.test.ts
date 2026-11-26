import { describe, expect, it } from 'vitest'
import { closestWord, correctSpelling, editDistance, wordsOf } from './spelling'

const known = wordsOf(['open', 'search', 'launch', 'play', 'naukri', 'linkedin', 'youtube', 'chrome', 'react', 'javascript', 'python', 'notepad', 'skills', 'volume'])

describe('editDistance', () => {
  it.each([
    ['naukri', 'naukri', 0],
    ['naukari', 'naukri', 1],
    ['opne', 'open', 1],
    ['serach', 'search', 1],
    ['youtbe', 'youtube', 1],
    ['javscrpt', 'javascript', 2],
    ['cat', 'dog', 3]
  ])('%s to %s is %i', (a, b, distance) => {
    expect(editDistance(a, b)).toBe(distance)
  })

  it('stops early once over the limit', () => {
    expect(editDistance('naukri', 'kubernetes', 2)).toBe(3)
  })
})

describe('closestWord', () => {
  it.each([
    ['opn', null],
    ['opne', 'open'],
    ['naukari', 'naukri'],
    ['NAUKARI', 'naukri'],
    ['serch', 'search'],
    ['reakt', 'react'],
    ['pyhton', 'python'],
    ['chorme', 'chrome'],
    ['lnkedin', 'linkedin']
  ])('"%s" means %s', (word, meant) => {
    expect(closestWord(word, known)).toBe(meant)
  })

  it('leaves right words, everyday words, short words, and numbers alone', () => {
    expect(closestWord('naukri', known)).toBeNull()
    expect(closestWord('jobs', known)).toBeNull()
    expect(closestWord('pune', known)).toBeNull()
    expect(closestWord('in', known)).toBeNull()
    expect(closestWord('2026', known)).toBeNull()
  })

  it('does not guess between two equally close words', () => {
    expect(closestWord('cart', wordsOf(['card', 'care']))).toBeNull()
  })

  it('leaves words far from anything it knows', () => {
    expect(closestWord('banana', known)).toBeNull()
  })
})

describe('correctSpelling', () => {
  it('fixes each misspelled word and says it changed something', () => {
    expect(correctSpelling('opne naukari', known)).toEqual({ text: 'open naukri', changed: true })
    expect(correctSpelling('serch reakt jobs in pune', known)).toEqual({ text: 'search react jobs in pune', changed: true })
  })

  it('changes nothing in a correct message', () => {
    expect(correctSpelling('open youtube in chrome', known)).toEqual({ text: 'open youtube in chrome', changed: false })
  })
})

describe('wordsOf', () => {
  it('splits names into lower-case words, keeping C++ and Node.js', () => {
    expect([...wordsOf(['Google Chrome', 'C++', 'Node.js', 'VS Code'])].sort()).toEqual(['c++', 'chrome', 'code', 'google', 'node.js'])
  })
})

describe('forms of one word', () => {
  it('picks between forms of one word, such as skill and skills', () => {
    expect(closestWord('skils', wordsOf(['skill', 'skills']))).toBe('skill')
  })
})

describe('everyday words', () => {
  it('are never turned into a nearby known word', () => {
    // "pune" is one edit from "pane", and "jobs" from "jabs", but both are meant as they are.
    const close = wordsOf(['pane', 'jabs', 'tusk'])
    expect(closestWord('pune', close)).toBeNull()
    expect(closestWord('jobs', close)).toBeNull()
    expect(closestWord('task', close)).toBeNull()
  })
})
