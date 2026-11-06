import { describe, expect, it } from 'vitest'
import {
  MAX_LONG_LENGTH,
  MAX_TEXT_LENGTH,
  childKinds,
  emptyValues,
  isLinkKind,
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

describe('isLinkKind', () => {
  it('accepts known links only', () => {
    expect(isLinkKind('goalSkill')).toBe(true)
    expect(isLinkKind('skill')).toBe(false)
  })
})

describe('childKinds', () => {
  it('lists only known kinds', () => {
    for (const kind of childKinds) expect(isRecordKind(kind)).toBe(true)
  })
})

describe('select fields', () => {
  const skill = recordFields.skill

  it('start at their initial value', () => {
    expect(emptyValues(skill)).toMatchObject({ category: 'technical', claimedLevel: '0', status: 'learning' })
  })

  it('fall back to their initial value when left out', () => {
    const { values, errors } = validateFields(skill, { name: 'React' })
    expect(errors).toEqual({})
    expect(values['claimedLevel']).toBe('0')
  })

  it.each([['6'], ['-1'], ['high'], ['1; DROP']])('reject the level %s', (claimedLevel) => {
    expect(validateFields(skill, { name: 'React', claimedLevel }).errors['claimedLevel']).toBeDefined()
  })

  it('accept every offered option', () => {
    for (const { value } of skill.find((f) => f.key === 'status')!.options!) {
      expect(validateFields(skill, { name: 'React', status: value }).errors).toEqual({})
    }
  })
})

describe('number and time fields', () => {
  it('accept numbers in range', () => {
    expect(validateFields(recordFields.task, { title: 'T', minutes: '45' }).errors).toEqual({})
  })

  it.each(['4', '481', '1.5', 'soon'])('reject %s minutes', (minutes) => {
    expect(validateFields(recordFields.task, { title: 'T', minutes }).errors['minutes']).toBeDefined()
  })

  it('accept a valid time and reject others', () => {
    const field = [{ key: 't', column: 't', label: 'T', type: 'time' as const }]
    expect(validateFields(field, { t: '22:00' }).errors).toEqual({})
    expect(validateFields(field, { t: '24:00' }).errors['t']).toBeDefined()
    expect(validateFields(field, { t: '9:00' }).errors['t']).toBeDefined()
  })
})

describe('date fields', () => {
  const goal = recordFields.goal

  it('accept a real date', () => {
    expect(validateFields(goal, { title: 'G', targetDate: '2028-02-29' }).errors).toEqual({})
  })

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-1-1', 'soon'])('reject %s', (targetDate) => {
    expect(validateFields(goal, { title: 'G', targetDate }).errors['targetDate']).toBeDefined()
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
