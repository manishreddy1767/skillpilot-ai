import { MAX_LEVEL, type ProofStatus, type SkillSummary } from '../../shared/progress'

const proofLabels: Record<ProofStatus, { icon: string; label: string } | null> = {
  none: null,
  unproven: { icon: '!', label: 'Unproven' },
  partly: { icon: '◐', label: 'Partly proven' },
  proven: { icon: '✓', label: 'Proven' }
}

export function ProofBadge({ proof }: { proof: ProofStatus }) {
  const shown = proofLabels[proof]
  if (!shown) return null
  return (
    <span className={`proof proof-${proof}`}>
      <span aria-hidden="true">{shown.icon}</span> {shown.label}
    </span>
  )
}

interface MeterProps {
  label: string
  value: number
}

/** A single share of 100, as a bar on a track. */
export function Meter({ label, value }: MeterProps) {
  return (
    <div className="meter" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="meter-fill" style={{ width: `${value}%` }} />
    </div>
  )
}

function LevelBar({ kind, level, name }: { kind: 'claimed' | 'demonstrated'; level: number; name: string }) {
  const text = `${name}: ${kind} level ${level} of ${MAX_LEVEL}`
  return (
    <div className="level-row" title={text}>
      <div className="level-track">
        <div className={`level-bar level-${kind}`} style={{ width: `${(level / MAX_LEVEL) * 100}%` }} />
      </div>
      <span className="level-value" aria-label={text}>
        {level}
      </span>
    </div>
  )
}

/** Compares what is claimed with what evidence shows, skill by skill. */
export function SkillChart({ skills }: { skills: SkillSummary[] }) {
  if (skills.length === 0) return null
  return (
    <div className="skill-chart">
      <div className="legend">
        <span>
          <i className="swatch level-claimed" /> Claimed
        </span>
        <span>
          <i className="swatch level-demonstrated" /> Demonstrated
        </span>
        <span className="legend-note">Levels 0 to {MAX_LEVEL}</span>
      </div>
      {skills.map((skill) => (
        <div className="skill-line" key={skill.id}>
          <div className="skill-name">
            <span>{skill.name}</span>
            <ProofBadge proof={skill.proof} />
          </div>
          <div className="skill-bars">
            <LevelBar kind="claimed" level={skill.claimed} name={skill.name} />
            <LevelBar kind="demonstrated" level={skill.demonstrated} name={skill.name} />
          </div>
        </div>
      ))}
    </div>
  )
}
