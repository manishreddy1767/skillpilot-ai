import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDGET_SIZE, widgetSettingFields } from '../../src/shared/settings'

describe('widget size', () => {
  it('defaults to a size the settings offer', () => {
    const field = widgetSettingFields.find((f) => f.key === 'widgetSize')!
    expect(field.initial).toBe(String(DEFAULT_WIDGET_SIZE))
    expect(field.options?.map((o) => o.value)).toContain(String(DEFAULT_WIDGET_SIZE))
  })

  it('is the size the real-mouse test expects', () => {
    const script = readFileSync(resolve(__dirname, '../desktop/widget.ps1'), 'utf8')
    expect(script).toContain(`$size = ${DEFAULT_WIDGET_SIZE}`)
  })
})
