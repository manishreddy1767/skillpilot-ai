import { DatabaseSync } from 'node:sqlite'
import { readdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, backupFolder, clearSavedData, databaseFile } from './app-harness'

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
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true }).first().click()

async function addSkill(page: Page, name: string, level: string): Promise<void> {
  await go(page, 'Skills')
  await page.getByRole('button', { name: 'Add skill' }).click()
  await page.getByLabel('Skill', { exact: false }).first().fill(name)
  await page.getByLabel('My level').selectOption(level)
  await save(page)
  await expect(page.getByRole('button', { name: `Edit ${name}` })).toBeVisible()
}

/** Adds data through the same bridge the screens use. */
function seed(page: Page, work: (api: Window['skillpilot']) => Promise<unknown>): Promise<unknown> {
  return page.evaluate(`(${work.toString()})(window.skillpilot)`)
}

test.describe('skills and evidence', () => {
  test('a claim alone shows as unproven, and evidence raises the demonstrated level', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await addSkill(page, 'React', '4')
    await expect(page.getByText('Unproven')).toBeVisible()
    await expect(page.getByLabel('React: demonstrated level 0 of 5')).toHaveText('0')

    await page.getByRole('button', { name: 'Details for React' }).click()
    await page.getByRole('button', { name: 'Add evidence' }).click()
    await page.getByLabel('What shows this skill').fill('Built a dashboard')
    await page.getByLabel('Strength').selectOption('3')
    await save(page)

    await expect(page.getByLabel('React: demonstrated level 2 of 5')).toHaveText('2')
    await expect(page.getByText('Partly proven')).toBeVisible()
  })

  test('refuses a duplicate skill name', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await addSkill(page, 'React', '2')
    await page.getByRole('button', { name: 'Add skill' }).click()
    await page.getByLabel('Skill', { exact: false }).first().fill('react')
    await save(page)
    await expect(page.getByText('You already have a skill with this name')).toBeVisible()
  })

  test('keeps a history of level changes', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await addSkill(page, 'React', '1')
    await page.getByRole('button', { name: 'Edit React' }).click()
    await page.getByLabel('My level').selectOption('3')
    await save(page)
    await page.getByRole('button', { name: 'Details for React' }).click()
    await expect(page.getByText('My level over time: 1 → 3.')).toBeVisible()
  })
})

test.describe('projects', () => {
  test('a finished project proves every linked skill', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await addSkill(page, 'React', '2')
    await addSkill(page, 'Python', '2')

    await go(page, 'Projects')
    await page.getByRole('button', { name: 'Add project' }).click()
    await page.getByLabel('Project', { exact: false }).first().fill('Portfolio')
    await page.getByLabel('Status').selectOption('complete')
    await save(page)
    await page.getByRole('button', { name: 'Details for Portfolio' }).click()
    await page.getByLabel('React').check()
    await page.getByLabel('Python').check()
    await expect(page.getByLabel('Python')).toBeChecked()

    await go(page, 'Skills')
    await expect(page.getByLabel('React: demonstrated level 2 of 5')).toHaveText('2')
    await expect(page.getByLabel('Python: demonstrated level 2 of 5')).toHaveText('2')
    await expect(page.locator('.proof-proven')).toHaveCount(2)
  })

  test('a planned project proves nothing yet', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await seed(page, async (api) => {
      const skill = await api.saveRecord('skill', null, { name: 'React', claimedLevel: '2' })
      const project = await api.saveRecord('project', null, { name: 'Idea', status: 'planned' })
      if (!skill.ok || !project.ok) throw new Error('seed failed')
      await api.setLink('projectSkill', project.value.id, skill.value.id, true)
    })
    await go(page, 'Skills')
    await expect(page.getByLabel('React: demonstrated level 0 of 5')).toHaveText('0')
  })
})

test('a certification and work experience raise the demonstrated level', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await addSkill(page, 'SQL', '3')
  await seed(page, async (api) => {
    await api.saveRecord('certification', null, { name: 'Database Certificate' })
    await api.saveRecord('work', null, { company: 'Acme', role: 'Analyst' })
  })
  await go(page, 'Certifications')
  await page.getByRole('button', { name: 'Details for Database Certificate' }).click()
  await page.getByRole('checkbox', { name: 'SQL' }).click()
  await expect(page.getByRole('checkbox', { name: 'SQL' })).toBeChecked()
  await go(page, 'Skills')
  await expect(page.getByLabel('SQL: demonstrated level 2 of 5')).toHaveText('2')

  await go(page, 'Experience')
  await page.getByRole('button', { name: 'Details for Analyst at Acme' }).click()
  await page.getByRole('checkbox', { name: 'SQL' }).click()
  await expect(page.getByRole('checkbox', { name: 'SQL' })).toBeChecked()
  await go(page, 'Skills')
  await expect(page.getByLabel('SQL: demonstrated level 3 of 5')).toHaveText('3')
  await expect(page.locator('.proof-proven')).toHaveCount(1)
})

test.describe('goals', () => {
  test('progress follows milestones and required skills through the screens', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await addSkill(page, 'React', '0')

    await go(page, 'Goals')
    await page.getByRole('button', { name: 'Add goal' }).click()
    await page.getByLabel('Goal', { exact: false }).first().fill('Get a job')
    await save(page)
    await page.getByRole('button', { name: 'Details for Get a job' }).click()

    await page.getByRole('button', { name: 'Add milestone' }).click()
    await page.getByLabel('Milestone').fill('Write a CV')
    await page.getByLabel('Status').last().selectOption('done')
    await save(page)
    await page.getByLabel('React').check()
    await expect(page.getByLabel('Level needed for React')).toHaveValue('3')

    await expect(page.getByText('1 of 1 milestones, 0 of 1 skills')).toBeVisible()
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    await expect(page.getByText('Still needed: React')).toBeVisible()

    await go(page, 'Dashboard')
    await expect(page.locator('.tile.hero strong')).toHaveText('50%')
    await expect(page.getByText('Reached Write a CV')).toBeVisible()
  })

  test('survive a restart', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await seed(page, async (api) => {
      const goal = await api.saveRecord('goal', null, { title: 'Kept goal' })
      if (!goal.ok) throw new Error('seed failed')
      await api.saveRecord('goalMilestone', null, { title: 'Kept step', status: 'done' }, goal.value.id)
    })
    await h.close()
    h = await Harness.launch({ keepData: true })
    const reopened = await openApp()
    await expect(reopened.locator('.tile.hero strong')).toHaveText('100%')
    await expect(reopened.getByText('Reached Kept step')).toBeVisible()
  })

  test('deleting a goal removes it from the dashboard and overview', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await seed(page, (api) => api.saveRecord('goal', null, { title: 'Temporary goal' }))
    await go(page, 'Goals')
    await page.getByRole('button', { name: 'Delete Temporary goal' }).click()
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await go(page, 'Dashboard')
    await expect(page.getByText('Temporary goal')).toHaveCount(0)
    await expect((await h.page(OVERVIEW)).getByText('No goal set yet')).toBeAttached()
  })
})

test('a deleted skill leaves nothing behind for a new skill to inherit', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page, async (api) => {
    const old = await api.saveRecord('skill', null, { name: 'Old skill' })
    const goal = await api.saveRecord('goal', null, { title: 'Goal' })
    if (!old.ok || !goal.ok) throw new Error('seed failed')
    await api.saveRecord('evidence', null, { description: 'Old proof', strength: '3' }, old.value.id)
    await api.setLink('goalSkill', goal.value.id, old.value.id, true, 3)
    await api.deleteRecord('skill', old.value.id)
    await api.saveRecord('skill', null, { name: 'New skill' })
  })
  await go(page, 'Skills')
  await expect(page.getByLabel('New skill: demonstrated level 0 of 5')).toHaveText('0')
  await go(page, 'Goals')
  await page.getByRole('button', { name: 'Details for Goal' }).click()
  await expect(page.getByLabel('New skill')).not.toBeChecked()
})

test.describe('dashboard', () => {
  test('starts with a prompt on an empty database', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Add a skill, a goal, or a project')).toBeVisible()
  })

  test('lists project progress', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await seed(page, async (api) => {
      const project = await api.saveRecord('project', null, { name: 'Portfolio', status: 'active' })
      if (!project.ok) throw new Error('seed failed')
      await api.saveRecord('projectMilestone', null, { title: 'Design', status: 'done' }, project.value.id)
    })
    await go(page, 'Skills')
    await go(page, 'Dashboard')
    await expect(page.getByText('1 of 1 milestones · In progress')).toBeVisible()
  })

  test('explains its numbers', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await page.getByText('How these numbers are worked out').click()
    await expect(page.getByText('Demonstrated level comes only from evidence', { exact: false })).toBeVisible()
  })
})

test('the hover overview fills in from real data, live', async () => {
  h = await Harness.launch()
  const page = await openApp()
  const overview = await h.page(OVERVIEW)
  await seed(page, async (api) => {
    await api.saveRecord('skill', null, { name: 'React', status: 'learning' })
    await api.saveRecord('skill', null, { name: 'Writing', status: 'completed' })
    const goal = await api.saveRecord('goal', null, { title: 'Get a job', targetDate: '2099-01-01' })
    if (!goal.ok) throw new Error('seed failed')
    await api.saveRecord('goalMilestone', null, { title: 'Write a CV', status: 'done' }, goal.value.id)
    await api.saveRecord('goalMilestone', null, { title: 'Apply', dueDate: '2098-06-01' }, goal.value.id)
  })
  await expect(overview.getByText('Get a job')).toBeAttached()
  await expect(overview.getByText('React', { exact: true })).toBeAttached()
  await expect(overview.getByText('Writing')).toHaveCount(0)
  await expect(overview.getByText('Apply')).toBeAttached()
  await expect(overview.getByText('Reached Write a CV')).toBeAttached()
  await expect(overview.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
})

test('the widget and overview cannot reach the new data', async () => {
  h = await Harness.launch()
  const result = await (await h.page(OVERVIEW)).evaluate(async () => {
    const api = window.skillpilot
    return [await api.getDashboard(), await api.listLinks('goalSkill', 1), await api.setLink('goalSkill', 1, 1, true, 3)]
  })
  for (const item of result) expect(item).toEqual({ ok: false, message: 'Not allowed.' })
})

test('an existing version 1 database upgrades, keeps its data, and is backed up first', async () => {
  h = await Harness.launch()
  await h.close()
  clearSavedData()

  const db = new DatabaseSync(databaseFile)
  db.exec(`
    CREATE TABLE profile (
      id INTEGER PRIMARY KEY CHECK (id = 1), full_name TEXT NOT NULL DEFAULT '', headline TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '', current_goal TEXT NOT NULL DEFAULT '', target_roles TEXT NOT NULL DEFAULT '',
      short_term_goals TEXT NOT NULL DEFAULT '', long_term_goals TEXT NOT NULL DEFAULT '',
      interests TEXT NOT NULL DEFAULT '', preferences TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO profile (id, full_name, current_goal) VALUES (1, 'Existing User', 'Old goal');
    PRAGMA user_version = 1;
  `)
  db.close()

  h = await Harness.launch({ keepData: true })
  await expect((await h.page(OVERVIEW)).getByText('Old goal')).toBeAttached()
  expect(readdirSync(backupFolder).some((name) => name.startsWith('pre-migration-v1-'))).toBe(true)
})
