import { describe, expect, it } from 'vitest'
import {
  MAX_LONG_LENGTH,
  MAX_TEXT_LENGTH,
  emptyValues,
  isRecordKind,
  profileFields,
  recordFields,
  recordKinds,
  validateFields
} from './career'

const education = recordFields.education
const validEducation = { institution: 'State University', qualification: 'BSc' }

describe('field definitions', () => {
  it('uses unique keys and columns in every table', () => {
    for (const fields of [profileFields, ...recordKinds.map((kind) => recordFields[kind])]) {
      expect(new Set(fields.map((f) => f.key)).size).toBe(fields.length)
      expect(new Set(fields.map((f) => f.column)).size).toBe(fields.length)
    }
  })

  it('uses only safe column names, because they are placed into SQL', () => {
    for (const fields of [profileFields, ...recordKinds.map((kind) => recordFields[kind])]) {
      for (const field of fields) expect(field.column).toMatch(/^[a-z_]+$/)
    }
  })
})

describe('isRecordKind', () => {
  it('accepts known kinds only', () => {
    expect(isRecordKind('work')).toBe(true)
    expect(isRecordKind('profile; DROP TABLE')).toBe(false)
    expect(isRecordKind(undefined)).toBe(false)
  })
})

describe('emptyValues', () => {
  it('gives every field an empty string', () => {
    expect(emptyValues(recordFields.certification)).toEqual({
      name: '',
      issuer: '',
      issueDate: '',
      expiryDate: '',
      credentialUrl: ''
    })
  })
})

describe('validateFields', () => {
  it('accepts valid input and trims it', () => {
    const { values, errors } = validateFields(education, { ...validEducation, notes: '  hi  ' })
    expect(errors).toEqual({})
    expect(values['notes']).toBe('hi')
  })

  it('reports missing required fields', () => {
    expect(validateFields(education, {}).errors).toEqual({
      institution: 'Institution is required',
      qualification: 'Qualification is required'
    })
  })

  it('treats spaces alone as missing', () => {
    expect(validateFields(profileFields, { fullName: '   ' }).errors['fullName']).toBeDefined()
  })

  it('drops unknown fields', () => {
    const { values } = validateFields(education, { ...validEducation, admin: 'yes' })
    expect(values).not.toHaveProperty('admin')
  })

  it.each([['null', null], ['text', 'x'], ['a number', 4]])('handles %s as input', (_name, input) => {
    expect(validateFields(education, input).errors['institution']).toBeDefined()
  })

  it('ignores values that are not strings', () => {
    const { values } = validateFields(education, { ...validEducation, notes: { a: 1 } })
    expect(values['notes']).toBe('')
  })

  it('limits text and long field lengths', () => {
    const atLimit = validateFields(profileFields, {
      fullName: 'a'.repeat(MAX_TEXT_LENGTH),
      summary: 'a'.repeat(MAX_LONG_LENGTH)
    })
    expect(atLimit.errors).toEqual({})
    const over = validateFields(profileFields, {
      fullName: 'a'.repeat(MAX_TEXT_LENGTH + 1),
      summary: 'a'.repeat(MAX_LONG_LENGTH + 1)
    })
    expect(Object.keys(over.errors).sort()).toEqual(['fullName', 'summary'])
  })

  it.each(['2026-13', '2026-00', '26-01', '2026-1', 'March'])('rejects the month %s', (startDate) => {
    expect(validateFields(education, { ...validEducation, startDate }).errors['startDate']).toBeDefined()
  })

  it('accepts a valid month', () => {
    const { errors } = validateFields(education, { ...validEducation, startDate: '2026-12' })
    expect(errors).toEqual({})
  })

  it('rejects an end before the start', () => {
    const { errors } = validateFields(education, {
      ...validEducation,
      startDate: '2024-06',
      endDate: '2024-05'
    })
    expect(errors['endDate']).toBe('End cannot be before Start')
  })

  it('allows the same month, and an end with no start', () => {
    const same = { ...validEducation, startDate: '2024-06', endDate: '2024-06' }
    expect(validateFields(education, same).errors).toEqual({})
    expect(validateFields(education, { ...validEducation, endDate: '2024-06' }).errors).toEqual({})
  })

  it.each(['a@b', 'a b@c.d', '@x.y'])('rejects the email %s', (email) => {
    expect(validateFields(profileFields, { fullName: 'A', email }).errors['email']).toBeDefined()
  })

  it('accepts a normal email', () => {
    expect(validateFields(profileFields, { fullName: 'A', email: 'me@mail.example' }).errors).toEqual({})
  })

  it.each(['javascript:alert(1)', 'file:///c:/x', 'example.com'])('rejects the link %s', (credentialUrl) => {
    const input = { name: 'Cert', credentialUrl }
    expect(validateFields(recordFields.certification, input).errors['credentialUrl']).toBeDefined()
  })

  it('accepts a web link', () => {
    const input = { name: 'Cert', credentialUrl: 'https://example.com/c/1' }
    expect(validateFields(recordFields.certification, input).errors).toEqual({})
  })
})
