import { describe, expect, it } from 'vitest'
import { describeRecord } from './summary'

describe('describeRecord', () => {
  it('describes work as role at company', () => {
    expect(
      describeRecord('work', { company: 'Acme', role: 'Developer', startDate: '2024-01', endDate: '', description: 'x' })
    ).toEqual({ main: 'Developer at Acme', detail: '2024-01' })
  })

  it('shows option labels rather than stored values', () => {
    expect(
      describeRecord('skill', { name: 'React', category: 'technical', claimedLevel: '3', status: 'learning', notes: 'x' })
    ).toEqual({ main: 'React', detail: 'Technical · 3 - Working · Learning now' })
  })

  it('leaves out empty values, long text and links', () => {
    expect(
      describeRecord('project', {
        name: 'App',
        technologies: '',
        status: 'active',
        completedOn: '',
        repoUrl: 'https://github.com/x',
        description: 'long'
      })
    ).toEqual({ main: 'App', detail: 'In progress' })
  })

  it('labels numbers, so they make sense on their own', () => {
    expect(describeRecord('roadmapItem', { title: 'CSS', week: '2', effortHours: '6', status: 'open' }).detail).toBe(
      'Week: 2 · Effort (hours): 6 · Not done'
    )
  })

  it('describes reminders and repeats', () => {
    expect(
      describeRecord('task', { title: 'Practise', kind: 'practice', dueDate: '', minutes: '20', status: 'open', remindAt: '09:00', repeat: 'daily' }).detail
    ).toBe('Practice · Minutes: 20 · To do · Remind me at: 09:00 · Every day')
  })

  it('keeps values with no matching option', () => {
    expect(describeRecord('goalMilestone', { title: 'Step', status: 'odd' }).detail).toBe('odd')
  })

  it('describes education with its qualification and dates', () => {
    expect(
      describeRecord('education', {
        institution: 'Uni',
        qualification: 'BSc',
        fieldOfStudy: '',
        startDate: '2020-09',
        endDate: '2024-06',
        notes: ''
      })
    ).toEqual({ main: 'Uni', detail: 'BSc · 2020-09 to 2024-06' })
  })
})
