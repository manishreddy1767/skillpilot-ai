import axe from 'axe-core'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW } from './app-harness'

let h: Harness

test.afterEach(async () => {
  await h.close()
})

async function openApp(): Promise<Page> {
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  return h.page(APP)
}

/**
 * Serious and critical WCAG A and AA problems, described well enough to fix. The engine is loaded
 * straight into the page, because Electron does not let the checker open pages of its own.
 */
async function problems(page: Page): Promise<string[]> {
  await page.evaluate(axe.source)
  const result = await page.evaluate(() =>
    (window as unknown as { axe: typeof axe }).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    })
  )
  return result.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)
}

const sections = [
  'Dashboard',
  'Tasks',
  'Assistant',
  'Skills',
  'Goals',
  'Projects',
  'Target roles',
  'Roadmaps',
  'Profile',
  'Education',
  'Experience',
  'Certifications',
  'Settings'
]

test('every screen passes automated WCAG AA checks, filled with data', async () => {
  test.setTimeout(90_000)
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(async () => {
    const api = window.skillpilot
    const skill = await api.saveRecord('skill', null, { name: 'React', claimedLevel: '3' })
    const goal = await api.saveRecord('goal', null, { title: 'Get a job' })
    if (skill.ok && goal.ok) await api.setLink('goalSkill', goal.value.id, skill.value.id, true, 3)
    await api.saveRecord('task', null, { title: 'Read', dueDate: '2020-01-01' })
    const role = await api.saveRecord('targetRole', null, { title: 'Dev' })
    if (role.ok) await api.saveRecord('roleRequirement', null, { skillName: 'CSS' }, role.value.id)
  })

  const found: string[] = []
  for (const section of sections) {
    await page.getByRole('button', { name: section, exact: true }).click()
    await page.waitForTimeout(150)
    for (const problem of await problems(page)) found.push(`${section}: ${problem}`)
  }
  expect(found).toEqual([])
})

test('an open form and an expanded record pass too', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(() => window.skillpilot.saveRecord('goal', null, { title: 'Goal' }))
  await page.getByRole('button', { name: 'Goals', exact: true }).click()
  await page.getByRole('button', { name: 'Details for Goal' }).click()
  await page.getByRole('button', { name: 'Add goal' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).last().click()
  expect(await problems(page)).toEqual([])
})

test('the hover panel passes', async () => {
  h = await Harness.launch()
  await h.openPanel()
  expect(await problems(await h.page(OVERVIEW))).toEqual([])
})

test('every control can be reached with the keyboard', async () => {
  h = await Harness.launch()
  const page = await openApp()
  const reached = new Set<string>()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    reached.add(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''))
  }
  for (const section of ['Dashboard', 'Tasks', 'Settings', 'Minimize to widget']) expect(reached).toContain(section)
})
