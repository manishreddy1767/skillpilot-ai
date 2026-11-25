import { expect, test, type Page } from '@playwright/test'
import { APP, Harness } from './app-harness'

let h: Harness

test.afterEach(async () => {
  await h.close()
})

const go = (page: Page, section: string) => page.getByRole('button', { name: section, exact: true }).click()

test('the skills library fills a role and plans its gaps with the AI off', async () => {
  h = await Harness.launch()
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  const page = await h.page(APP)
  await page.evaluate(async () => {
    const api = window.skillpilot
    const settings = await api.getSettings()
    if (settings.ok) await api.saveSettings({ ...settings.value, aiProvider: 'off' })
    await api.saveRecord('targetRole', null, { title: 'Junior Data Analyst' })
    await api.saveRecord('skill', null, { name: 'MS Excel', claimedLevel: '4', status: 'using' })
  })

  await go(page, 'Target roles')
  await page.getByRole('button', { name: 'Details for Junior Data Analyst' }).click()
  await expect(page.getByLabel('Closest library role')).toHaveValue('data-analyst')
  await page.getByRole('button', { name: 'Suggest requirements' }).click()
  await expect(page.getByText('Add requirement: SQL')).toBeVisible()
  for (const skill of ['SQL', 'Excel', 'Power BI']) {
    await page.getByRole('button', { name: `Accept Add requirement: ${skill}` }).click()
  }
  await expect(page.getByRole('cell', { name: 'SQL' })).toBeVisible()
  // Excel counts as partly there, from the skill saved as "MS Excel".
  await expect(page.getByRole('row', { name: /Excel/ })).toContainText('Needs work')

  await page.getByRole('button', { name: 'Plan a roadmap for my gaps' }).click()
  await page.getByRole('button', { name: 'Accept Add roadmap: Junior Data Analyst plan' }).click()
  await go(page, 'Roadmaps')
  await page.getByRole('button', { name: 'Details for Junior Data Analyst plan' }).click()
  await expect(page.getByText('SQL: reach level 3', { exact: true })).toBeVisible()
})
