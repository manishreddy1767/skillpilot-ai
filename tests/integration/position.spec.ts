import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { APP, HALF, Harness, OVERVIEW, SIZE, WIDGET, pause, positionFile } from './app-harness'

/** The default spot keeps a 48 pixel margin from the bottom right. */
const MARGIN = SIZE + 48

let h: Harness

test.afterEach(async () => {
  await h.close()
})

const widgetAt = async () => {
  const { x, y } = (await h.state(WIDGET))!.bounds
  return { x, y }
}

const expectWidgetAt = (x: number, y: number) =>
  expect.poll(widgetAt, { timeout: 3000 }).toEqual({ x, y })

test.describe('remembering position', () => {
  test('starts near the bottom right the first time', async () => {
    h = await Harness.launch()
    const display = await h.realDisplay()
    expect(await widgetAt()).toEqual({
      x: display.workArea.x + display.workArea.width - MARGIN,
      y: display.workArea.y + display.workArea.height - MARGIN
    })
  })

  test('returns to the same spot after quitting and reopening', async () => {
    h = await Harness.launch()
    await h.dragWidgetTo(500, 400)
    await h.close()
    h = await Harness.launch({ keepPosition: true })
    expect(await widgetAt()).toEqual({ x: 500 - HALF, y: 400 - HALF })
  })

  test('remembers a spot partly off the screen edge', async () => {
    h = await Harness.launch()
    await h.dragWidgetTo(2, 2)
    await h.close()
    h = await Harness.launch({ keepPosition: true })
    expect(await widgetAt()).toEqual({ x: 2 - HALF, y: 2 - HALF })
  })

  test('saves the moment a drag ends, without waiting for quit', async () => {
    h = await Harness.launch()
    await h.dragWidgetTo(500, 400)
    expect(JSON.parse(readFileSync(positionFile, 'utf8'))).toMatchObject({ x: 500 - HALF, y: 400 - HALF })
  })

  test('a click saves nothing', async () => {
    h = await Harness.launch()
    await h.dragWidgetTo(500, 400)
    rmSync(positionFile)
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    expect(existsSync(positionFile)).toBe(false)
  })

  test('a damaged position file falls back to the default', async () => {
    h = await Harness.launch()
    const display = await h.realDisplay()
    await h.dragWidgetTo(500, 400)
    await h.close()
    writeFileSync(positionFile, '{ not json')
    h = await Harness.launch({ keepPosition: true })
    expect((await widgetAt()).x).toBe(display.workArea.x + display.workArea.width - MARGIN)
  })

  test('a position saved on a missing monitor recovers at launch', async () => {
    h = await Harness.launch()
    const display = await h.realDisplay()
    await h.close()
    writeFileSync(
      positionFile,
      JSON.stringify({
        x: 5000,
        y: 300,
        displayId: 999,
        displayBounds: { x: 4000, y: 0, width: 2000, height: 1000 }
      })
    )
    h = await Harness.launch({ keepPosition: true })
    const { x, y } = await widgetAt()
    expect(x).toBeGreaterThanOrEqual(display.workArea.x)
    expect(x + SIZE).toBeLessThanOrEqual(display.workArea.x + display.workArea.width)
    expect(y + SIZE).toBeLessThanOrEqual(display.workArea.y + display.workArea.height)
  })
})

test.describe('display changes', () => {
  const external = {
    id: 2,
    bounds: { x: 1536, y: 0, width: 1920, height: 1080 },
    workArea: { x: 1536, y: 0, width: 1920, height: 1032 }
  }

  test('recovers when a monitor is removed, and returns when it comes back', async () => {
    h = await Harness.launch()
    const laptop = await h.realDisplay()
    await h.setDisplays([laptop, external], 'display-added')
    await h.dragWidgetTo(2532, 576)
    expect(await widgetAt()).toEqual({ x: 2532 - HALF, y: 576 - HALF })

    await h.setDisplays([laptop])
    await expect.poll(async () => (await widgetAt()).x, { timeout: 3000 }).toBeLessThan(1536 - SIZE)

    await h.setDisplays([laptop, external], 'display-added')
    await expectWidgetAt(2532 - HALF, 576 - HALF)
  })

  test('recovers when the resolution shrinks', async () => {
    h = await Harness.launch()
    const laptop = await h.realDisplay()
    await h.dragWidgetTo(1436, 736)
    const smaller = {
      ...laptop,
      bounds: { x: 0, y: 0, width: 1024, height: 600 },
      workArea: { x: 0, y: 0, width: 1024, height: 552 }
    }
    await h.setDisplays([smaller], 'display-metrics-changed')
    await expect.poll(async () => (await widgetAt()).x, { timeout: 3000 }).toBeLessThanOrEqual(1024 - SIZE)
    expect((await widgetAt()).y).toBeLessThanOrEqual(552 - SIZE)
  })

  test('does not move the widget when it is still reachable', async () => {
    h = await Harness.launch()
    const laptop = await h.realDisplay()
    await h.dragWidgetTo(500, 400)
    await h.setDisplays([laptop], 'display-metrics-changed')
    await pause(500)
    expect(await widgetAt()).toEqual({ x: 500 - HALF, y: 400 - HALF })
  })

  test('a recovery does not overwrite the saved spot', async () => {
    h = await Harness.launch()
    const laptop = await h.realDisplay()
    await h.setDisplays([laptop, external], 'display-added')
    await h.dragWidgetTo(2532, 576)
    await pause(100)
    const saved = readFileSync(positionFile, 'utf8')
    await h.setDisplays([laptop])
    await expect.poll(async () => (await widgetAt()).x, { timeout: 3000 }).toBeLessThan(1536)
    expect(readFileSync(positionFile, 'utf8')).toBe(saved)
  })

  test('a drag in progress is not interrupted', async () => {
    h = await Harness.launch()
    const laptop = await h.realDisplay()
    const { x, y } = await h.cursorToWidget()
    await h.call(WIDGET, 'dragPress', { x: HALF, y: HALF })
    await h.moveCursor(x - 300, y - 300)
    await h.call(WIDGET, 'dragMove')
    const mid = await widgetAt()
    await h.setDisplays([laptop], 'display-metrics-changed')
    await pause(500)
    expect(await widgetAt()).toEqual(mid)
    await h.call(WIDGET, 'dragRelease')
  })

  test('recovery closes an open panel', async () => {
    h = await Harness.launch()
    const laptop = await h.realDisplay()
    await h.setDisplays([laptop, external], 'display-added')
    await h.dragWidgetTo(2532, 576)
    await h.openPanel()
    // With the cursor on the panel, only the recovery can close it.
    const panel = (await h.state(OVERVIEW))!.bounds
    await h.moveCursor(panel.x + 100, panel.y + 100)
    await h.setDisplays([laptop])
    await expect.poll(() => h.visible(OVERVIEW), { timeout: 3000 }).toBe(false)
  })

  test('waking from sleep re-checks the position', async () => {
    h = await Harness.launch()
    const laptop = await h.realDisplay()
    await h.setDisplays([laptop, external], 'display-added')
    await h.dragWidgetTo(2532, 576)
    await h.app.evaluate(({ screen, powerMonitor }, only) => {
      screen.getAllDisplays = () => [only] as never
      powerMonitor.emit('resume')
    }, laptop)
    await expect.poll(async () => (await widgetAt()).x, { timeout: 3000 }).toBeLessThan(1536)
  })
})

test.describe('reset and app placement', () => {
  test('tray reset returns the widget and remembers it', async () => {
    h = await Harness.launch()
    const display = await h.realDisplay()
    const home = {
      x: display.workArea.x + display.workArea.width - MARGIN,
      y: display.workArea.y + display.workArea.height - MARGIN
    }
    await h.dragWidgetTo(500, 400)
    await h.clickTrayItem('Reset widget position')
    await expectWidgetAt(home.x, home.y)
    await h.close()
    h = await Harness.launch({ keepPosition: true })
    expect(await widgetAt()).toEqual(home)
  })

  test('the full app opens centred on the display holding the widget', async () => {
    h = await Harness.launch()
    const { workArea } = await h.realDisplay()
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    const { bounds } = (await h.state(APP))!
    expect(bounds.x).toBeGreaterThanOrEqual(workArea.x)
    // Reported sizes are rounded under display scaling. The exact maths has a unit test.
    expect(Math.abs(bounds.x + bounds.width / 2 - (workArea.x + workArea.width / 2))).toBeLessThanOrEqual(4)
  })

  test('the full app follows the widget to another display', async () => {
    h = await Harness.launch()
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    await h.call(APP, 'minimizeToWidget')
    await expect.poll(() => h.visible(APP)).toBe(false)
    await h.app.evaluate(({ screen }) => {
      screen.getDisplayMatching = () =>
        ({ workArea: { x: 3000, y: 0, width: 1600, height: 900 } }) as never
    })
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    expect((await h.state(APP))!.bounds.x).toBeGreaterThanOrEqual(3000)
  })
})
