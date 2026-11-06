import { analyseGap } from '../../shared/gap'
import { buildDashboard } from '../../shared/progress'
import type { CareerStore } from '../db/career-store'

function section(title: string, lines: string[]): string {
  return lines.length ? `## ${title}\n${lines.join('\n')}` : ''
}

function compact(values: (string | undefined)[]): string {
  return values.filter(Boolean).join(' | ')
}

/**
 * What the AI is told about the user. Name, email, phone and location are left out
 * on purpose: career advice does not need them.
 */
export function buildCareerContext(store: CareerStore, today: string): string {
  const profile = store.getProfile()
  const dashboard = buildDashboard(store.readCareerRows(), today)
  const records = (kind: Parameters<CareerStore['listRecords']>[0]) => store.listRecords(kind).map((r) => r.values)

  const about = [
    ['Headline', profile['headline']],
    ['About', profile['summary']],
    ['Current goal', profile['currentGoal']],
    ['Target roles', profile['targetRoles']],
    ['Short-term goals', profile['shortTermGoals']],
    ['Long-term goals', profile['longTermGoals']],
    ['Interests', profile['interests']],
    ['Career preferences', profile['preferences']]
  ].flatMap(([label, value]) => (value ? [`${label}: ${value}`] : []))

  const roles = store.listRecords('targetRole').map((role) => {
    const requirements = store.listRecords('roleRequirement', role.id).map(({ values }) => ({
      skillName: values['skillName'] ?? '',
      requiredLevel: Number(values['requiredLevel']),
      importance: Number(values['importance'])
    }))
    const { readiness, items } = analyseGap(requirements, dashboard.skills)
    const gaps = items.filter((item) => item.status !== 'met').map((item) => item.skillName)
    return compact([
      role.values['title'],
      readiness === null ? undefined : `readiness ${readiness}%`,
      gaps.length ? `gaps: ${gaps.join(', ')}` : undefined
    ])
  })

  return [
    `Today is ${today}.`,
    section('About me', about),
    section(
      'Education',
      records('education').map((v) => compact([v['qualification'], v['fieldOfStudy'], v['startDate'], v['endDate']]))
    ),
    section(
      'Experience',
      records('work').map((v) => compact([v['role'], v['startDate'], v['endDate'], v['description']]))
    ),
    section(
      'Certifications',
      records('certification').map((v) => compact([v['name'], v['issuer'], v['issueDate']]))
    ),
    section(
      'Skills (levels 0 to 5)',
      dashboard.skills.map(
        (s) => `${s.name} | ${s.category} | ${s.status} | claimed ${s.claimed} | demonstrated ${s.demonstrated}`
      )
    ),
    section(
      'Goals',
      dashboard.goals.map((g) =>
        compact([g.title, g.status, `${g.progress}%`, g.targetDate, g.missingSkills.length ? `missing: ${g.missingSkills.join(', ')}` : undefined])
      )
    ),
    section(
      'Projects',
      dashboard.projects.map((p) => compact([p.name, p.status, p.skills.join(', ')]))
    ),
    section('Target roles', roles)
  ]
    .filter(Boolean)
    .join('\n\n')
}
