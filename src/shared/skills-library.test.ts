import { describe, expect, it } from 'vitest'
import {
  LIBRARY_ROLES,
  LIBRARY_SKILLS,
  canonicalSkillName,
  findRole,
  findSkill,
  inLearningOrder,
  libraryRole,
  skillsInText
} from './skills-library'

const found = (text: string) => skillsInText(text).map(({ skill }) => skill.name)

describe('the library data', () => {
  it('has many skills and roles', () => {
    expect(LIBRARY_SKILLS.length).toBeGreaterThan(100)
    expect(LIBRARY_ROLES.length).toBeGreaterThanOrEqual(20)
  })

  it('gives every skill one owner for each of its names', () => {
    const owners = new Map<string, string>()
    for (const skill of LIBRARY_SKILLS) {
      for (const name of [skill.name, ...skill.aliases].map((n) => n.toLowerCase())) {
        const owner = owners.get(name)
        if (owner && owner !== skill.name) throw new Error(`"${name}" belongs to both ${owner} and ${skill.name}`)
        owners.set(name, skill.name)
      }
    }
  })

  it('only refers to skills it has, in prerequisites and in roles', () => {
    const names = new Set(LIBRARY_SKILLS.map((skill) => skill.name))
    for (const skill of LIBRARY_SKILLS) for (const first of skill.after) expect(names, `${skill.name} after ${first}`).toContain(first)
    for (const role of LIBRARY_ROLES) for (const [name] of role.needs) expect(names, `${role.title} needs ${name}`).toContain(name)
  })

  it('has sensible levels and importance, no repeated needs, and unique role ids', () => {
    for (const role of LIBRARY_ROLES) {
      expect(new Set(role.needs.map(([name]) => name)).size).toBe(role.needs.length)
      for (const [, level, importance] of role.needs) {
        expect(level).toBeGreaterThanOrEqual(1)
        expect(level).toBeLessThanOrEqual(5)
        expect([1, 2, 3]).toContain(importance)
      }
      expect(role.needs.some(([, , importance]) => importance === 3)).toBe(true)
    }
    expect(new Set(LIBRARY_ROLES.map((role) => role.id)).size).toBe(LIBRARY_ROLES.length)
  })

  it('has no circular prerequisites', () => {
    const visit = (name: string, path: string[]): void => {
      if (path.includes(name)) throw new Error(`Circular: ${[...path, name].join(' → ')}`)
      for (const first of findSkill(name)!.after) visit(first, [...path, name])
    }
    for (const skill of LIBRARY_SKILLS) visit(skill.name, [])
  })

  it('names what to study without web links', () => {
    for (const skill of LIBRARY_SKILLS) {
      expect(skill.learn).not.toMatch(/https?:|www\./)
      expect(skill.practice.length).toBeGreaterThan(10)
    }
  })
})

describe('findSkill and canonicalSkillName', () => {
  it.each([
    ['react.js', 'React'],
    ['ReactJS', 'React'],
    ['js', 'JavaScript'],
    ['k8s', 'Kubernetes'],
    ['DSA', 'Data structures and algorithms'],
    ['postgres', 'PostgreSQL'],
    ['ASP.NET Core', '.NET'],
    ['  Node JS ', 'Node.js']
  ])('"%s" is %s', (name, canonical) => {
    expect(canonicalSkillName(name)).toBe(canonical)
  })

  it('leaves unknown skills as they are, trimmed', () => {
    expect(findSkill('Underwater basket weaving')).toBeNull()
    expect(canonicalSkillName('  Underwater basket weaving ')).toBe('Underwater basket weaving')
  })
})

describe('findRole', () => {
  it.each([
    ['Frontend Developer', 'frontend-developer'],
    ['Jr. React Developer', 'frontend-developer'],
    ['SDE 1', 'software-engineer'],
    ['Associate Software Engineer', 'software-engineer'],
    ['Senior Java Spring Boot Developer', 'java-developer'],
    ['MERN Stack Developer', 'full-stack-developer'],
    ['Data Analyst - Power BI', 'data-analyst'],
    ['SOC Analyst L1', 'cybersecurity-analyst'],
    ['Automation Tester', 'qa-engineer'],
    ['AI/ML Engineer', 'ml-engineer'],
    ['Product Owner', 'product-manager']
  ])('"%s" is %s', (title, id) => {
    expect(findRole(title)?.id).toBe(id)
  })

  it('finds nothing for an unrelated title', () => {
    expect(findRole('Chef de partie')).toBeNull()
    expect(findRole('')).toBeNull()
  })

  it('looks roles up by id', () => {
    expect(libraryRole('data-analyst')?.title).toBe('Data Analyst')
    expect(libraryRole('nope')).toBeNull()
  })
})

describe('skillsInText', () => {
  const jd = `We are hiring a Full Stack Developer (React.js / Node.js) for our R&D team in Bengaluru.
You will excel in a fast-paced team and express ideas clearly. The rest of the team uses Java, not JavaScript only.
Must have: JavaScript, TypeScript, REST APIs, MongoDB, SQL, Git. Nice to have: Docker, AWS, C/C++, C#, Go or Golang.
Strong communication and problem solving. A solid understanding of data structures. Some ASP.NET exposure is a plus.`

  it('finds the skills a job description asks for', () => {
    expect(found(jd)).toEqual(
      expect.arrayContaining(['React', 'Node.js', 'JavaScript', 'TypeScript', 'REST APIs', 'MongoDB', 'SQL', 'Git', 'Docker', 'AWS', 'C', 'C++', 'C#', 'Go', 'Java', 'Communication', 'Problem solving', '.NET'])
    )
  })

  it('is not fooled by everyday words or parts of other names', () => {
    const names = found(jd)
    // "R&D", "excel in", "express ideas", "the rest of", "solid understanding" are not skills here.
    expect(names).not.toContain('R')
    expect(names).not.toContain('Excel')
    expect(names).not.toContain('Express')
    expect(names).not.toContain('Design patterns')
    expect(found('Experience with JavaScript and TypeScript')).not.toContain('Java')
    expect(found('Ready to go the extra mile')).not.toContain('Go')
    expect(found('We value swift delivery')).not.toContain('Swift')
  })

  it('counts mentions, most mentioned first', () => {
    const result = skillsInText('Python, python, PYTHON and SQL')
    expect(result[0]).toMatchObject({ skill: { name: 'Python' }, mentions: 3 })
    expect(result[1]).toMatchObject({ skill: { name: 'SQL' }, mentions: 1 })
  })

  it('finds a skill at the end of a sentence', () => {
    expect(found('Our stack is built on Node.js.')).toContain('Node.js')
    expect(found('Advanced Excel.')).toContain('Excel')
  })
})

describe('inLearningOrder', () => {
  it('puts prerequisites first, keeping the order otherwise', () => {
    expect(inLearningOrder(['React', 'Next.js', 'HTML', 'JavaScript'])).toEqual(['HTML', 'JavaScript', 'React', 'Next.js'])
    expect(inLearningOrder(['Kubernetes', 'Docker', 'Linux'])).toEqual(['Linux', 'Docker', 'Kubernetes'])
  })

  it('keeps unknown skills, and uses usual names', () => {
    expect(inLearningOrder(['reactjs', 'Basket weaving', 'js'])).toEqual(['JavaScript', 'React', 'Basket weaving'])
  })
})
