import { DatabaseSync } from 'node:sqlite'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, WIDGET, databaseFile } from './app-harness'

let h: Harness

test.afterEach(async () => {
  await h.close()
})

async function openApp(): Promise<Page> {
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  return h.page(APP)
}

const go = (page: Page, section: string) => page.getByRole('button', { name: section, exact: true }).click()
const seed = (page: Page, work: string) => page.evaluate(work)

const localToday = (): string => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function addTodayTask(page: Page, title: string, minutes = 30): Promise<void> {
  await go(page, 'Tasks')
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.getByLabel('Task', { exact: false }).first().fill(title)
  await page.getByLabel('Due').fill(localToday())
  await page.getByLabel('Minutes').fill(String(minutes))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: `Edit ${title}` })).toBeVisible()
}

test('a task due today appears, and finishing it builds the streak and week', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await addTodayTask(page, 'Read chapter', 45)
  await expect(page.getByRole('checkbox', { name: 'Read chapter' })).toBeVisible()
  await expect(page.getByText('45 minutes planned')).toBeVisible()
  await expect(page.getByText('0 days')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Read chapter' }).click()
  await expect(page.getByText('Nothing is due today.')).toBeVisible()
  await expect(page.getByText('1 day', { exact: true })).toBeVisible()
  await expect(page.getByText('45 of 300 min')).toBeVisible()
})

test('tasks can be ticked off from the hover panel without opening the app', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await addTodayTask(page, 'Quick practice')
  await h.call(APP, 'minimizeToWidget')
  await h.openPanel()
  const overview = await h.page(OVERVIEW)
  await overview.getByRole('checkbox', { name: 'Quick practice' }).click()
  await expect(overview.getByText('Nothing planned for today')).toBeAttached()
  await expect(overview.getByText('1 day streak')).toBeAttached()
})

test('the widget window cannot complete tasks', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await addTodayTask(page, 'Protected')
  const result = await (await h.page(WIDGET)).evaluate(() => window.skillpilot.completeTask(1))
  expect(result).toEqual({ ok: false, message: 'Not allowed.' })
  await go(page, 'Dashboard')
  await go(page, 'Tasks')
  await expect(page.getByRole('checkbox', { name: 'Protected' })).toBeVisible()
})

test('an overdue task is marked, and shown as the next deadline', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page, `window.skillpilot.saveRecord('task', null, { title: 'Late work', dueDate: '2020-01-01' })`)
  await go(page, 'Tasks')
  await expect(page.getByText('Overdue · 30 min')).toBeVisible()
  await expect((await h.page(OVERVIEW)).getByText('Overdue · 2020-01-01')).toBeAttached()
})

test('a finished roadmap topic moves progress on, and catching up shifts the plan', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(
    page,
    `(async () => {
      const api = window.skillpilot
      const roadmap = await api.saveRecord('roadmap', null, { title: 'Path', startDate: '2020-01-06' })
      await api.saveRecord('roadmapItem', null, { title: 'First', week: '1', status: 'done', effortHours: '2' }, roadmap.value.id)
      await api.saveRecord('roadmapItem', null, { title: 'Second', week: '2', effortHours: '3' }, roadmap.value.id)
    })()`
  )
  await go(page, 'Roadmaps')
  await page.getByRole('button', { name: 'Details for Path' }).click()
  await expect(page.getByText('1 of 2 topics · 3 hours left')).toBeVisible()
  await expect(page.getByText('Next: Second')).toBeVisible()
  await expect(page.getByText(/weeks behind/)).toBeVisible()

  await page.getByRole('button', { name: 'Move remaining topics to start this week' }).click()
  await expect(page.getByText(/weeks behind/)).toHaveCount(0)
})

test('a roadmap with no start date can be started', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(
    page,
    `(async () => {
      const api = window.skillpilot
      const roadmap = await api.saveRecord('roadmap', null, { title: 'Later' })
      await api.saveRecord('roadmapItem', null, { title: 'Topic', week: '1' }, roadmap.value.id)
    })()`
  )
  await go(page, 'Roadmaps')
  await page.getByRole('button', { name: 'Details for Later' }).click()
  await page.getByRole('button', { name: 'Start this week' }).click()
  await expect(page.getByRole('button', { name: 'Start this week' })).toHaveCount(0)
})

test('the dashboard brings learning together', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(
    page,
    `(async () => {
      const api = window.skillpilot
      const today = ${JSON.stringify(localToday())}
      await api.saveRecord('task', null, { title: 'Dashboard task', dueDate: today })
      const roadmap = await api.saveRecord('roadmap', null, { title: 'Dashboard path' })
      await api.saveRecord('roadmapItem', null, { title: 'Next topic', week: '1' }, roadmap.value.id)
      const role = await api.saveRecord('targetRole', null, { title: 'Dev' })
      await api.saveRecord('roleRequirement', null, { skillName: 'CSS' }, role.value.id)
    })()`
  )
  await go(page, 'Skills')
  await go(page, 'Dashboard')
  await expect(page.getByText('Dashboard task').first()).toBeVisible()
  await expect(page.getByText('Dashboard path')).toBeVisible()
  await expect(page.getByText('Recommended next')).toBeVisible()
  await expect(page.getByRole('main').getByText('Next topic', { exact: true })).toBeVisible()
  await expect(page.getByText('Gaps: CSS')).toBeVisible()
})

test('finishing a repeating task schedules the next one', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await go(page, 'Tasks')
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.getByLabel('Task', { exact: false }).first().fill('Daily practice')
  await page.getByLabel('Due').fill(localToday())
  await page.getByLabel('Repeat').selectOption('daily')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Daily practice' }).click()
  await expect(page.getByText('Nothing is due today.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Daily practice' })).toHaveCount(2)
})

test('a reminder arrives at its time', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(
    (today) => window.skillpilot.saveRecord('task', null, { title: 'Stretch', dueDate: today, remindAt: '00:00' }),
    localToday()
  )
  await h.app.evaluate(({ powerMonitor }) => void powerMonitor.emit('resume'))
  await expect
    .poll(() => h.app.evaluate(() => (globalThis as unknown as { __notices: { body: string }[] }).__notices.map((n) => n.body)))
    .toContain('Stretch')
})

test('tasks and streaks survive a restart', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await addTodayTask(page, 'Kept')
  await page.getByRole('checkbox', { name: 'Kept' }).click()
  await expect(page.getByText('1 day', { exact: true })).toBeVisible()
  await h.close()

  const db = new DatabaseSync(databaseFile, { readOnly: true })
  const row = db.prepare('SELECT status, completed_on FROM task').get() as { status: string; completed_on: string }
  db.close()
  expect(row).toEqual({ status: 'done', completed_on: localToday() })

  h = await Harness.launch({ keepData: true })
  const reopened = await openApp()
  await go(reopened, 'Tasks')
  await expect(reopened.getByText('1 day', { exact: true })).toBeVisible()
})
