import { DatabaseSync } from 'node:sqlite'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, databaseFile } from './app-harness'

let h: Harness

test.afterEach(async () => {
  await h.close()
})

async function openApp(): Promise<Page> {
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  return h.page(APP)
}

const localDay = (offset = 0): string => {
  const date = new Date(Date.now() + offset * 86_400_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

test('a snapshot is saved for today, and updated as things change', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(async () => {
    const api = window.skillpilot
    const goal = await api.saveRecord('goal', null, { title: 'Goal' })
    if (goal.ok) await api.saveRecord('goalMilestone', null, { title: 'Step', status: 'done' }, goal.value.id)
    await api.saveRecord('skill', null, { name: 'React', claimedLevel: '2' })
  })
  await h.close()

  const db = new DatabaseSync(databaseFile, { readOnly: true })
  const row = db.prepare('SELECT day, overall, skills FROM progress_snapshot').get() as { day: string; overall: number; skills: string }
  db.close()
  expect(row.day).toBe(localDay())
  expect(row.overall).toBe(100)
  expect(JSON.parse(row.skills)).toEqual({ React: [2, 0] })
})

test('past snapshots draw a trend and show what improved', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(async () => {
    const api = window.skillpilot
    const skill = await api.saveRecord('skill', null, { name: 'React', claimedLevel: '3' })
    if (skill.ok) await api.saveRecord('evidence', null, { description: 'App', strength: '3' }, skill.value.id)
    const goal = await api.saveRecord('goal', null, { title: 'Goal' })
    if (goal.ok) await api.saveRecord('goalMilestone', null, { title: 'Step', status: 'done' }, goal.value.id)
  })
  await h.close()

  const db = new DatabaseSync(databaseFile)
  const insert = db.prepare('INSERT INTO progress_snapshot (day, overall, skills) VALUES (?, ?, ?)')
  insert.run(localDay(-40), 20, JSON.stringify({ React: [3, 0] }))
  insert.run(localDay(-20), 60, JSON.stringify({ React: [3, 0] }))
  db.close()

  h = await Harness.launch({ keepData: true })
  const reopened = await openApp()
  await expect(reopened.getByRole('heading', { name: 'Progress over time' })).toBeVisible()
  await expect(reopened.locator('svg[role="img"] circle.hit')).toHaveCount(3)
  await expect(reopened.getByText('Demonstrated level 0 → 2')).toBeVisible()
})

test('the month review counts finished tasks', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(async () => {
    const api = window.skillpilot
    await api.saveRecord('task', null, { title: 'One', status: 'done', minutes: '25' })
    await api.saveRecord('task', null, { title: 'Two', status: 'done', minutes: '35' })
  })
  await page.getByRole('button', { name: 'Tasks', exact: true }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByText('so far')).toBeVisible()
  await expect(page.getByText(/^60 min/)).toBeVisible()
})
