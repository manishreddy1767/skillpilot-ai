import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, WIDGET, backupFolder, clearSavedData, databaseFile, pause } from './app-harness'

let h: Harness

test.afterEach(async () => {
  await h.close()
})

async function openApp(): Promise<Page> {
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  const page = await h.page(APP)
  await goToProfile(page)
  return page
}

const goToProfile = (page: Page) => page.getByRole('button', { name: 'Profile', exact: true }).click()

async function fillProfile(page: Page, name: string, goal: string): Promise<void> {
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Current goal').fill(goal)
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
}

test.describe('profile', () => {
  test('is saved and survives a restart', async () => {
    h = await Harness.launch()
    await fillProfile(await openApp(), 'Sam Doe', 'Become a developer')
    await h.close()

    h = await Harness.launch({ keepData: true })
    const page = await openApp()
    await expect(page.getByLabel('Full name')).toHaveValue('Sam Doe')
    await expect(page.getByLabel('Current goal')).toHaveValue('Become a developer')
  })

  test('shows validation errors and saves nothing', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByText('Full name is required')).toBeVisible()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    await expect(page.getByLabel('Full name')).toBeFocused()
    await page.reload()
    await goToProfile(page)
    await expect(page.getByLabel('Email')).toHaveValue('')
  })

  test('stores quotes and SQL as plain text', async () => {
    h = await Harness.launch()
    const name = "Robert'); DROP TABLE profile;--"
    const page = await openApp()
    await fillProfile(page, name, 'x')
    await page.reload()
    await goToProfile(page)
    await expect(page.getByLabel('Full name')).toHaveValue(name)
  })

  test('renders markup in saved text as text', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await fillProfile(page, 'Sam', '<img src=x onerror="window.__hacked=1">')
    const overview = await h.page(OVERVIEW)
    await expect(overview.getByText('<img src=x', { exact: false })).toBeAttached()
    expect(await overview.evaluate(() => (window as unknown as { __hacked?: number }).__hacked)).toBeUndefined()
  })
})

test.describe('hover overview', () => {
  test('starts with empty states', async () => {
    h = await Harness.launch()
    await expect((await h.page(OVERVIEW)).getByText('No goal set yet')).toBeAttached()
  })

  test('updates the moment the profile is saved', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await page.getByLabel('Target roles').fill('Frontend Developer')
    await fillProfile(page, 'Sam Doe', 'Become a developer')
    const overview = await h.page(OVERVIEW)
    await expect(overview.getByText('Become a developer')).toBeAttached()
    await expect(overview.getByText('Target: Frontend Developer')).toBeAttached()
    await expect(overview.getByText("Hi Sam, here's your career at a glance")).toBeAttached()
  })

  test('shows saved data straight after a restart', async () => {
    h = await Harness.launch()
    await fillProfile(await openApp(), 'Sam', 'Saved goal')
    await h.close()
    h = await Harness.launch({ keepData: true })
    await expect((await h.page(OVERVIEW)).getByText('Saved goal')).toBeAttached()
  })
})

const kinds = [
  {
    nav: 'Education',
    add: 'Add education',
    fill: { Institution: 'State University', Qualification: 'BSc' },
    listed: 'State University'
  },
  {
    nav: 'Experience',
    add: 'Add experience',
    fill: { Company: 'Acme', Role: 'Developer' },
    listed: 'Developer at Acme'
  },
  {
    nav: 'Certifications',
    add: 'Add certification',
    fill: { Certification: 'Cloud Basics' },
    listed: 'Cloud Basics'
  }
]

for (const kind of kinds) {
  test.describe(kind.nav, () => {
    test('adds, edits, survives a restart, and deletes', async () => {
      h = await Harness.launch()
      let page = await openApp()
      await page.getByRole('button', { name: kind.nav, exact: true }).click()
      await page.getByRole('button', { name: kind.add }).click()
      for (const [label, value] of Object.entries(kind.fill)) await page.getByLabel(label, { exact: false }).first().fill(value)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText(kind.listed)).toBeVisible()

      await h.close()
      h = await Harness.launch({ keepData: true })
      page = await openApp()
      await page.getByRole('button', { name: kind.nav, exact: true }).click()
      await expect(page.getByText(kind.listed)).toBeVisible()

      await page.getByRole('button', { name: `Delete ${kind.listed}` }).click()
      await page.getByRole('button', { name: 'Yes, delete' }).click()
      await expect(page.getByText(kind.listed)).toHaveCount(0)
    })
  })
}

test('edits a record in place', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await page.getByRole('button', { name: 'Education', exact: true }).click()
  await page.getByRole('button', { name: 'Add education' }).click()
  await page.getByLabel('Institution').fill('Old Name')
  await page.getByLabel('Qualification').fill('BSc')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Old Name' }).click()
  await page.getByLabel('Institution').fill('New Name')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('New Name')).toBeVisible()
  await expect(page.getByText('Old Name')).toHaveCount(0)
})

test('rejects an end date before the start', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await page.getByRole('button', { name: 'Experience', exact: true }).click()
  await page.getByRole('button', { name: 'Add experience' }).click()
  await page.getByLabel('Company').fill('Acme')
  await page.getByLabel('Role').fill('Developer')
  await page.getByLabel('Start').fill('2024-06')
  await page.getByLabel('End').fill('2024-01')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('End cannot be before Start')).toBeVisible()
})

test.describe('access control', () => {
  const blocked = { ok: false, message: 'Not allowed.' }

  test('the widget and overview cannot read or change career data', async () => {
    h = await Harness.launch()
    await fillProfile(await openApp(), 'Sam', 'Private goal')
    for (const title of [WIDGET, OVERVIEW]) {
      const page = await h.page(title)
      const results = await page.evaluate(async () => {
        const api = window.skillpilot
        return [
          await api.getProfile(),
          await api.saveProfile({ fullName: 'Hacked' }),
          await api.listRecords('education'),
          await api.saveRecord('education', null, { institution: 'x', qualification: 'y' }),
          await api.deleteRecord('education', 1)
        ]
      })
      for (const result of results) expect(result).toEqual(blocked)
    }
  })

  test('the widget cannot read the overview data', async () => {
    h = await Harness.launch()
    const result = await (await h.page(WIDGET)).evaluate(() => window.skillpilot.getOverview())
    expect(result).toEqual(blocked)
  })

  test('data calls are refused before the full app has opened', async () => {
    h = await Harness.launch()
    const result = await (await h.page(OVERVIEW)).evaluate(() => window.skillpilot.getProfile())
    expect(result).toEqual(blocked)
  })

  test('bad input straight through the bridge is rejected', async () => {
    h = await Harness.launch()
    const page = await openApp()
    const results = await page.evaluate(async () => {
      const api = window.skillpilot as unknown as Record<string, (...a: unknown[]) => Promise<{ ok: boolean }>>
      return [
        await api['listRecords']!('sqlite_master'),
        await api['saveRecord']!('education', 'DROP', {}),
        await api['deleteRecord']!('profile', 1),
        await api['saveProfile']!(null)
      ]
    })
    for (const result of results) expect(result.ok).toBe(false)
  })
})

test.describe('storage', () => {
  test('creates the database and makes one backup a day', async () => {
    h = await Harness.launch()
    expect(existsSync(databaseFile)).toBe(true)
    expect(readdirSync(backupFolder).filter((n) => n.startsWith('skillpilot-'))).toHaveLength(1)
    await h.close()
    h = await Harness.launch({ keepData: true })
    expect(readdirSync(backupFolder).filter((n) => n.startsWith('skillpilot-'))).toHaveLength(1)
  })

  test('a damaged database keeps the widget running and the file intact', async () => {
    h = await Harness.launch()
    await h.close()
    clearSavedData()
    writeFileSync(databaseFile, 'not a database '.repeat(100))
    const before = readFileSync(databaseFile)

    // Replaces the error box, which would otherwise wait for a click.
    h = await Harness.launch({ keepData: true, quietErrors: true })
    expect(await h.visible(WIDGET)).toBe(true)
    await h.openPanel()
    await expect((await h.page(OVERVIEW)).getByText('No goal set yet')).toBeAttached()
    const page = await openApp()
    await expect(page.getByRole('alert')).toContainText('could not be opened')
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled()
    expect(await h.errorBoxes()).toHaveLength(1)
    await pause(100)
    expect(readFileSync(databaseFile).equals(before)).toBe(true)
  })

  test('a database from a newer app is refused and left unchanged', async () => {
    h = await Harness.launch()
    await h.close()
    clearSavedData()
    const db = new DatabaseSync(databaseFile)
    db.exec('PRAGMA user_version = 99')
    db.close()
    h = await Harness.launch({ keepData: true, quietErrors: true })
    expect((await h.errorBoxes())[0]).toContain('version 99')
    await h.close()
    const check = new DatabaseSync(databaseFile)
    expect(check.prepare('PRAGMA user_version').get()).toEqual({ user_version: 99 })
    check.close()
  })
})
