import {
  isLinkKind,
  isRecordKind,
  profileFields,
  recordFields,
  validateFields,
  type FieldValues,
  type Link,
  type OverviewData,
  type RecordKind,
  type Result,
  type StoredRecord
} from '../shared/career'
import { analyseGap } from '../shared/gap'
import type { RoleReadiness } from '../shared/ipc'
import { monthReview, progressTrend, type History } from '../shared/history'
import { buildLearning, catchUpStart, summariseRoadmap, type Learning } from '../shared/learning'
import { MAX_LEVEL, buildDashboard, type Dashboard } from '../shared/progress'
import { needsParent, type CareerStore } from './db/career-store'

export interface HandlerDeps {
  getStore(): CareerStore | null
  /** Called after any change that the hover overview shows. */
  notifyOverview(): void
  logError(error: unknown): void
  /** Today as YYYY-MM-DD, in local time. */
  today(): string
  /** The first priority from the newest gap report. */
  latestPriority?(): string | null
  /** The weekly learning target, in minutes. */
  weeklyTarget?(): number
  /** The monthly learning target, in minutes. */
  monthlyTarget?(): number
}

export type { RoleReadiness }

const UNAVAILABLE = 'Your data could not be opened. Restart the app, and see the error log if it continues.'
const FAILED = 'That could not be saved. Your earlier data is unchanged.'
const FIX_FIELDS = 'Please fix the highlighted fields.'

function failure(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

function isId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isDuplicate(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: skill\.name/.test(error.message)
}

/** Checks the kind and its parent id together. Null means they are fine. */
function kindProblem(kind: unknown, parentId: unknown): string | null {
  if (!isRecordKind(kind)) return 'Unknown record type.'
  if (needsParent(kind) ? !isId(parentId) : parentId != null) return 'Unknown record.'
  return null
}

/** Everything renderers can do with career data. All input is untrusted here. */
export function createDataHandlers({
  getStore,
  notifyOverview,
  logError,
  today,
  latestPriority = () => null,
  weeklyTarget = () => 0,
  monthlyTarget = () => 0
}: HandlerDeps) {
  const withStore = <T>(work: (store: CareerStore) => Result<T>): Result<T> => {
    const store = getStore()
    if (!store) return failure(UNAVAILABLE)
    try {
      return work(store)
    } catch (error) {
      logError(error)
      return failure(FAILED)
    }
  }

  const parentOf = (kind: RecordKind, parentId: unknown): number | null =>
    needsParent(kind) ? (parentId as number) : null

  /** What to do next: the newest report's priority, then the next roadmap topic. */
  const recommendation = (store: CareerStore): string | null => {
    const next = buildLearning(store.readLearningRows(), today(), 0).roadmaps.find((roadmap) => roadmap.next)?.next
    return latestPriority() ?? next ?? null
  }

  return {
    getProfile: (): Result<FieldValues> =>
      withStore((store) => ({ ok: true, value: store.getProfile() })),

    saveProfile: (input: unknown): Result<FieldValues> =>
      withStore((store) => {
        const { values, errors } = validateFields(profileFields, input)
        if (Object.keys(errors).length) return { ok: false, message: FIX_FIELDS, errors }
        const value = store.saveProfile(values)
        notifyOverview()
        return { ok: true, value }
      }),

    listRecords: (kind: unknown, parentId?: unknown): Result<StoredRecord[]> =>
      withStore((store) => {
        const problem = kindProblem(kind, parentId)
        if (problem) return failure(problem)
        const known = kind as RecordKind
        return { ok: true, value: store.listRecords(known, parentOf(known, parentId)) }
      }),

    saveRecord: (kind: unknown, id: unknown, input: unknown, parentId?: unknown): Result<StoredRecord> =>
      withStore((store) => {
        const problem = kindProblem(kind, parentId)
        if (problem) return failure(problem)
        if (id !== null && !isId(id)) return failure('Unknown record.')
        const known = kind as RecordKind
        const { values, errors } = validateFields(recordFields[known], input)
        if (Object.keys(errors).length) return { ok: false, message: FIX_FIELDS, errors }
        try {
          const value = store.saveRecord(known, id, values, parentOf(known, parentId))
          if (!value) return failure('That record no longer exists.')
          notifyOverview()
          return { ok: true, value }
        } catch (error) {
          if (!isDuplicate(error)) throw error
          const taken = 'You already have a skill with this name'
          return { ok: false, message: FIX_FIELDS, errors: { name: taken } }
        }
      }),

    deleteRecord: (kind: unknown, id: unknown, parentId?: unknown): Result<boolean> =>
      withStore((store) => {
        const problem = kindProblem(kind, parentId)
        if (problem) return failure(problem)
        if (!isId(id)) return failure('Unknown record.')
        const known = kind as RecordKind
        const value = store.deleteRecord(known, id, parentOf(known, parentId))
        notifyOverview()
        return { ok: true, value }
      }),

    listLinks: (kind: unknown, parentId: unknown): Result<Link[]> =>
      withStore((store) => {
        if (!isLinkKind(kind) || !isId(parentId)) return failure('Unknown link.')
        return { ok: true, value: store.listLinks(kind, parentId) }
      }),

    setLink: (kind: unknown, parentId: unknown, childId: unknown, linked: unknown, level?: unknown): Result<boolean> =>
      withStore((store) => {
        if (!isLinkKind(kind) || !isId(parentId) || !isId(childId) || typeof linked !== 'boolean') {
          return failure('Unknown link.')
        }
        const required = level ?? 3
        if (!Number.isInteger(required) || (required as number) < 1 || (required as number) > MAX_LEVEL) {
          return failure('Choose a level from 1 to 5.')
        }
        store.setLink(kind, parentId, childId, linked, required as number)
        notifyOverview()
        return { ok: true, value: true }
      }),

    getDashboard: (): Result<Dashboard> =>
      withStore((store) => ({ ok: true, value: buildDashboard(store.readCareerRows(), today()) })),

    getHistory: (): Result<History> =>
      withStore((store) => {
        const rows = store.readCareerRows()
        const dashboard = buildDashboard(rows, today())
        const snapshots = store.readSnapshots()
        return {
          ok: true,
          value: {
            trend: progressTrend(snapshots, today()),
            month: monthReview(snapshots, rows, store.readLearningRows().tasks, dashboard.skills, dashboard.overall, today())
          }
        }
      }),

    /** Saves today's snapshot. Called at startup and after changes. */
    recordSnapshot: (): Result<boolean> =>
      withStore((store) => {
        const dashboard = buildDashboard(store.readCareerRows(), today())
        const skills = Object.fromEntries(
          dashboard.skills.map((skill) => [skill.name, [skill.claimed, skill.demonstrated] as [number, number]])
        )
        store.recordSnapshot({ day: today(), overall: dashboard.overall, skills })
        return { ok: true, value: true }
      }),

    getLearning: (): Result<Learning> =>
      withStore((store) => ({
        ok: true,
        value: buildLearning(store.readLearningRows(), today(), weeklyTarget(), monthlyTarget())
      })),

    getRecommendation: (): Result<string | null> =>
      withStore((store) => ({ ok: true, value: recommendation(store) })),

    getRoleReadiness: (): Result<RoleReadiness[]> =>
      withStore((store) => {
        const { skills } = buildDashboard(store.readCareerRows(), today())
        const value = store.listRecords('targetRole').map((role) => {
          const requirements = store.listRecords('roleRequirement', role.id).map(({ values }) => ({
            skillName: values['skillName'] ?? '',
            requiredLevel: Number(values['requiredLevel']),
            importance: Number(values['importance'])
          }))
          const { readiness, items } = analyseGap(requirements, skills)
          return {
            id: role.id,
            title: role.values['title'] ?? '',
            readiness,
            gaps: items.filter((item) => item.status !== 'met').map((item) => item.skillName)
          }
        })
        return { ok: true, value }
      }),

    completeTask: (id: unknown): Result<boolean> =>
      withStore((store) => {
        if (!isId(id)) return failure('Unknown task.')
        const value = store.completeTask(id)
        notifyOverview()
        return { ok: true, value }
      }),

    rescheduleRoadmap: (id: unknown): Result<boolean> =>
      withStore((store) => {
        if (!isId(id)) return failure('Unknown roadmap.')
        const rows = store.readLearningRows()
        const roadmap = rows.roadmaps.find((item) => item.id === id)
        if (!roadmap) return failure('That roadmap no longer exists.')
        const { nextWeek } = summariseRoadmap(roadmap, rows.items, today())
        if (nextWeek === null) return failure('This roadmap has no topics left.')
        return { ok: true, value: store.setRoadmapStart(id, catchUpStart(nextWeek, today())) }
      }),

    getOverview: (): Result<OverviewData> =>
      withStore((store) => {
        const { fullName, currentGoal, targetRoles } = store.getProfile()
        const dashboard = buildDashboard(store.readCareerRows(), today())
        const learning = buildLearning(store.readLearningRows(), today(), 0)
        const topGoal = dashboard.goals.find((goal) => goal.status === 'active')
        return {
          ok: true,
          value: {
            name: fullName ?? '',
            currentGoal: currentGoal || topGoal?.title || '',
            targetRoles: targetRoles ?? '',
            progress: dashboard.overall,
            learning: dashboard.skills.filter((skill) => skill.status === 'learning').map((skill) => skill.name),
            nextDeadline: dashboard.deadlines[0] ?? null,
            latestAchievement: dashboard.achievements[0]?.title ?? null,
            tasks: learning.todayTasks.slice(0, 3),
            streak: learning.streak,
            recommendation: recommendation(store)
          }
        }
      })
  }
}

export type DataHandlers = ReturnType<typeof createDataHandlers>
