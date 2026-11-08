import type { TrendPoint } from '../../shared/history'

const WIDTH = 640
const HEIGHT = 160
const PAD = { left: 36, right: 12, top: 10, bottom: 24 }

/** Overall progress over time: one series, so no legend. Each point has a tooltip, and a table follows. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return <p className="lead">Your progress history builds up a day at a time. Check back in a few days.</p>
  }

  const first = Date.parse(points[0]!.day)
  const span = Math.max(1, Date.parse(points.at(-1)!.day) - first)
  const x = (day: string) => PAD.left + ((Date.parse(day) - first) / span) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) => PAD.top + (1 - value / 100) * (HEIGHT - PAD.top - PAD.bottom)
  const line = points.map((point) => `${x(point.day).toFixed(1)},${y(point.overall).toFixed(1)}`).join(' ')
  const last = points.at(-1)!

  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Overall progress from ${points[0]!.day} to ${last.day}, now ${last.overall}%`}>
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line className="grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="axis" x={PAD.left - 6} y={y(tick) + 4} textAnchor="end">
              {tick}%
            </text>
          </g>
        ))}
        <text className="axis" x={PAD.left} y={HEIGHT - 6}>
          {points[0]!.day}
        </text>
        <text className="axis" x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end">
          {last.day}
        </text>
        <polyline className="trend-line" points={line} />
        {points.map((point) => (
          <g key={point.day}>
            <circle className="hit" cx={x(point.day)} cy={y(point.overall)} r={9}>
              <title>{`${point.day}: ${point.overall}%`}</title>
            </circle>
          </g>
        ))}
        <circle className="end-dot" cx={x(last.day)} cy={y(last.overall)} r={4} />
        <text className="end-label" x={x(last.day) - 8} y={y(last.overall) - 8} textAnchor="end">
          {last.overall}%
        </text>
      </svg>
      <table className="visually-hidden">
        <caption>Overall progress by day</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{point.day}</th>
              <td>{point.overall}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
