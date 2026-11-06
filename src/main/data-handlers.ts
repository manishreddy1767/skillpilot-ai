import {
  isRecordKind,
  profileFields,
  recordFields,
  validateFields,
  type FieldValues,
  type OverviewData,
  type Result,
  type StoredRecord
} from '../shared/career'
import type { CareerStore } from './db/career-store'

export interface HandlerDeps {
  getStore(): CareerStore | null
  /** Called after any change that the hover overview shows. */
  notifyOverview(): void
  logError(error: unknown): void
}

const UNAVAILABLE = 'Your data could not be opened. Restart the app, and see the error log if it continues.'
const FAILED = 'That could not be saved. Your earlier data is unchanged.'

function failure(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

function isId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

/** Everything renderers can do with career data. All input is untrusted here. */
export function createDataHandlers({ getStore, notifyOverview, logError }: HandlerDeps) {
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

  return {
    getProfile: (): Result<FieldValues> =>
      withStore((store) => ({ ok: true, value: store.getProfile() })),

    saveProfile: (input: unknown): Result<FieldValues> =>
      withStore((store) => {
        const { values, errors } = validateFields(profileFields, input)
        if (Object.keys(errors).length) return { ok: false, message: 'Please fix the highlighted fields.', errors }
        const value = store.saveProfile(values)
        notifyOverview()
        return { ok: true, value }
      }),

    listRecords: (kind: unknown): Result<StoredRecord[]> =>
      withStore((store) => {
        if (!isRecordKind(kind)) return failure('Unknown record type.')
        return { ok: true, value: store.listRecords(kind) }
      }),

    saveRecord: (kind: unknown, id: unknown, input: unknown): Result<StoredRecord> =>
      withStore((store) => {
        if (!isRecordKind(kind)) return failure('Unknown record type.')
        if (id !== null && !isId(id)) return failure('Unknown record.')
        const { values, errors } = validateFields(recordFields[kind], input)
        if (Object.keys(errors).length) return { ok: false, message: 'Please fix the highlighted fields.', errors }
        const value = store.saveRecord(kind, id, values)
        return value ? { ok: true, value } : failure('That record no longer exists.')
      }),

    deleteRecord: (kind: unknown, id: unknown): Result<boolean> =>
      withStore((store) => {
        if (!isRecordKind(kind)) return failure('Unknown record type.')
        if (!isId(id)) return failure('Unknown record.')
        return { ok: true, value: store.deleteRecord(kind, id) }
      }),

    getOverview: (): Result<OverviewData> =>
      withStore((store) => ({ ok: true, value: store.getOverview() }))
  }
}

export type DataHandlers = ReturnType<typeof createDataHandlers>
