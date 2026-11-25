import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { CareerStore } from '../db/career-store'
import { migrate } from '../db/migrations'
import { readResumeSource } from './resume-source'

const open: DatabaseSync[] = []
afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
})

it('reads your profile, skills, and records, with the skills linked to each role and project', () => {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  const store = new CareerStore(db)
  store.saveProfile({ fullName: 'Asha Rao', email: 'asha@example.com' })
  const react = store.saveRecord('skill', null, { name: 'React', claimedLevel: '3', status: 'using' })!
  store.saveRecord('evidence', null, { description: 'Shipped an app', kind: 'project', strength: '3', observedOn: '2026-01-01' }, react.id)
  const work = store.saveRecord('work', null, { company: 'Initech', role: 'Intern', description: 'Built things' })!
  const project = store.saveRecord('project', null, { name: 'Site', status: 'complete' })!
  store.setLink('workSkill', work.id, react.id, true)
  store.setLink('projectSkill', project.id, react.id, true)
  store.saveRecord('education', null, { institution: 'Pune University', qualification: 'B.E.' })

  const source = readResumeSource(store, '2026-11-25')
  expect(source.profile).toMatchObject({ fullName: 'Asha Rao', email: 'asha@example.com' })
  expect(source.skills).toEqual([{ name: 'React', category: 'technical', claimed: 3, demonstrated: expect.any(Number) }])
  expect(source.skills[0]!.demonstrated).toBeGreaterThan(0)
  expect(source.work[0]).toMatchObject({ values: { company: 'Initech' }, skills: ['React'] })
  expect(source.projects[0]).toMatchObject({ values: { name: 'Site' }, skills: ['React'] })
  expect(source.education).toHaveLength(1)
  expect(source.certifications).toEqual([])
})
