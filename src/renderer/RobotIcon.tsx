import { ROBOT_SIZE, robotShapes, type Shape } from '../shared/robot-icon'

function draw(shape: Shape, key: number) {
  switch (shape.kind) {
    case 'circle':
      return <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill} />
    case 'ring':
      return <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} fill="none" stroke={shape.stroke} strokeWidth={shape.width} />
    case 'rect':
      return <rect key={key} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} fill={shape.fill} />
    case 'line':
      return (
        <polyline
          key={key}
          points={shape.points.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={shape.stroke}
          strokeWidth={shape.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
  }
}

/** The SkillPilot robot. Decorative: whatever holds it gives the name. */
export function RobotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${ROBOT_SIZE} ${ROBOT_SIZE}`} aria-hidden="true" focusable="false">
      {robotShapes.map(draw)}
    </svg>
  )
}
