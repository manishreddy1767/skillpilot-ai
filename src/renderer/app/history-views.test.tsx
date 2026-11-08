import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { History } from '../../shared/history'
import { HistorySection } from './HistorySection'
import { TrendChart } from './TrendChart'

const api = () => vi.mocked(window.skillpilot)

const history = (over: Partial<History['month']> = {}, trend: History['trend'] = []): History => ({
  trend,
  month: {
    month: '2026-11',
    minutes: 120,
    previousMinutes: 90,
    tasksDone: 4,
    achievements: 2,
    improved: [{ name: 'React', from: 1, to: 3 }],
    overallChange: 12,
    ...over
  }
})

describe('TrendChart', () => {
  it('explains that history needs time when there is too little', () => {
    render(<TrendChart points={[{ day: '2026-11-08', overall: 10 }]} />)
    expect(screen.getByText(/builds up a day at a time/)).toBeTruthy()
  })

  it('describes the trend, labels the latest value, and offers a table', () => {
    const points = [
      { day: '2026-11-01', overall: 20 },
      { day: '2026-11-08', overall: 45 }
    ]
    const { container } = render(<TrendChart points={points} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Overall progress from 2026-11-01 to 2026-11-08, now 45%')
    expect(container.querySelector('.end-label')?.textContent).toBe('45%')
    expect(container.querySelectorAll('title')).toHaveLength(2)
    expect(screen.getByRole('table').textContent).toContain('2026-11-0120%')
  })

  it('places a higher value higher on the chart', () => {
    const { container } = render(
      <TrendChart
        points={[
          { day: '2026-11-01', overall: 0 },
          { day: '2026-11-08', overall: 100 }
        ]}
      />
    )
    const [low, high] = [...container.querySelectorAll('circle.hit')].map((c) => Number(c.getAttribute('cy')))
    expect(high!).toBeLessThan(low!)
  })
})

describe('HistorySection', () => {
  it('shows the month and skills that improved', async () => {
    api().getHistory.mockResolvedValue({ ok: true, value: history() })
    render(<HistorySection />)
    expect(await screen.findByText('120 min · 30 more than last month')).toBeTruthy()
    expect(screen.getByText('Up 12 points')).toBeTruthy()
    expect(screen.getByText('Demonstrated level 1 → 3')).toBeTruthy()
  })

  it('reports less time and a drop honestly', async () => {
    api().getHistory.mockResolvedValue({ ok: true, value: history({ minutes: 50, previousMinutes: 90, overallChange: -5, improved: [] }) })
    render(<HistorySection />)
    expect(await screen.findByText('50 min · 40 fewer than last month')).toBeTruthy()
    expect(screen.getByText('Down 5 points')).toBeTruthy()
    expect(screen.queryByText('Skills that improved')).toBeNull()
  })

  it('leaves out the change in progress without history', async () => {
    api().getHistory.mockResolvedValue({ ok: true, value: history({ overallChange: null, minutes: 0, previousMinutes: 0 }) })
    render(<HistorySection />)
    expect(await screen.findByText('Tasks finished')).toBeTruthy()
    expect(screen.queryByText('Overall progress')).toBeNull()
    expect(screen.getByText('0 min')).toBeTruthy()
  })
})
