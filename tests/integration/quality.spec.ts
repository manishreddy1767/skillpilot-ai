import { execSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, WIDGET, pause } from './app-harness'

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

test('saved data survives the app being killed', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(async () => {
    const api = window.skillpilot
    await api.saveProfile({ fullName: 'Crash Test', currentGoal: 'Survive' })
    await api.saveRecord('skill', null, { name: 'Resilience', claimedLevel: '3' })
  })
  const pid = h.app.process().pid!
  execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
  await pause(2500)

  h = await Harness.launch({ keepData: true })
  await expect((await h.page(OVERVIEW)).getByText('Survive')).toBeAttached()
  const reopened = await openApp()
  await go(reopened, 'Skills')
  await expect(reopened.getByRole('button', { name: 'Edit Resilience' })).toBeVisible()
})

test('screens stay quick with a lot of data', async () => {
  test.setTimeout(60_000)
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(async () => {
    const api = window.skillpilot
    const skills: number[] = []
    for (let i = 0; i < 200; i++) {
      const skill = await api.saveRecord('skill', null, { name: `Skill ${i}`, claimedLevel: String(i % 6) })
      if (skill.ok) skills.push(skill.value.id)
    }
    for (const id of skills.slice(0, 100)) {
      await api.saveRecord('evidence', null, { description: 'Evidence', strength: '2' }, id)
    }
    for (let i = 0; i < 50; i++) {
      const goal = await api.saveRecord('goal', null, { title: `Goal ${i}` })
      if (!goal.ok) continue
      await api.saveRecord('goalMilestone', null, { title: 'Step' }, goal.value.id)
      await api.setLink('goalSkill', goal.value.id, skills[i]!, true, 3)
    }
    for (let i = 0; i < 500; i++) await api.saveRecord('task', null, { title: `Task ${i}`, status: i % 2 ? 'done' : 'open' })
  })

  const timing = await page.evaluate(async () => {
    const api = window.skillpilot
    const time = async (work: () => Promise<unknown>) => {
      const start = performance.now()
      await work()
      return performance.now() - start
    }
    return {
      dashboard: await time(() => api.getDashboard()),
      learning: await time(() => api.getLearning()),
      skills: await time(() => api.listRecords('skill')),
      tasks: await time(() => api.listRecords('task'))
    }
  })
  console.log(`With 200 skills, 50 goals, 500 tasks: ${JSON.stringify(timing)}`)
  for (const value of Object.values(timing)) expect(value).toBeLessThan(500)

  const overviewTime = await (await h.page(OVERVIEW)).evaluate(async () => {
    const start = performance.now()
    await window.skillpilot.getOverview()
    return performance.now() - start
  })
  console.log(`Overview: ${overviewTime} ms`)
  expect(overviewTime).toBeLessThan(150)

  await go(page, 'Dashboard')
  await go(page, 'Skills')
  await expect(page.getByRole('button', { name: 'Edit Skill 199' })).toBeAttached()
})

test('long text does not break layouts or lose content', async () => {
  h = await Harness.launch()
  const page = await openApp()
  const long = 'x'.repeat(200)
  await page.evaluate(async (text) => {
    const api = window.skillpilot
    await api.saveRecord('skill', null, { name: text })
    await api.saveRecord('goal', null, { title: text })
    await api.saveRecord('task', null, { title: text, dueDate: '2020-01-01' })
  }, long)
  for (const section of ['Dashboard', 'Skills', 'Goals', 'Tasks']) {
    await go(page, section)
    await pause(150)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, section).toBeLessThanOrEqual(0)
  }
  const panel = await h.page(OVERVIEW)
  const fits = await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(fits).toBe(true)
})

test('the hover panel fits its window with everything filled in', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(async () => {
    const api = window.skillpilot
    await api.saveProfile({ fullName: 'Sam', currentGoal: 'A goal', targetRoles: 'A role' })
    const goal = await api.saveRecord('goal', null, { title: 'Goal', targetDate: '2099-01-01' })
    if (!goal.ok) throw new Error('seed failed')
    await api.saveRecord('goalMilestone', null, { title: 'Done', status: 'done' }, goal.value.id)
    await api.saveRecord('skill', null, { name: 'React' })
    for (const title of ['One', 'Two', 'Three', 'Four']) {
      await api.saveRecord('task', null, { title, dueDate: '2020-01-01' })
    }
    const roadmap = await api.saveRecord('roadmap', null, { title: 'Path' })
    if (roadmap.ok) await api.saveRecord('roadmapItem', null, { title: 'Topic' }, roadmap.value.id)
  })
  const panel = await h.page(OVERVIEW)
  await expect(panel.getByText('Reached Done')).toBeAttached()
  const overflow = await panel.evaluate(() => {
    const element = document.querySelector('.panel')!
    return element.scrollHeight - element.clientHeight
  })
  expect(overflow).toBeLessThanOrEqual(0)
})

test('an idle app makes no repeated work', async () => {
  h = await Harness.launch()
  const before = await h.app.evaluate(() => process.cpuUsage())
  await pause(3000)
  const after = await h.app.evaluate(() => process.cpuUsage())
  const milliseconds = (after.user + after.system - before.user - before.system) / 1000
  console.log(`Main process CPU over 3s idle: ${milliseconds} ms`)
  expect(milliseconds).toBeLessThan(300)
})

test('the widget stays usable after many open and close cycles', async () => {
  h = await Harness.launch()
  for (let i = 0; i < 15; i++) {
    await h.openPanel()
    await h.moveCursor(5, 5)
    await expect.poll(() => h.visible(OVERVIEW)).toBe(false)
  }
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  expect(await h.windowCount()).toBe(3)
  expect(await h.visible(WIDGET)).toBe(true)
})
