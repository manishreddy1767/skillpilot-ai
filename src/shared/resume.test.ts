import { describe, expect, it } from 'vitest'
import { addsUnclaimedSkill, applySuggestion, buildResume, bulletsFrom, keywordCoverage, parseResumeData, resumeText, type ResumeSource } from './resume'

const source: ResumeSource = {
  profile: {
    fullName: 'Asha Rao',
    headline: 'Frontend Developer',
    email: 'asha@example.com',
    phone: '+91 90000 00000',
    location: 'Pune',
    summary: 'I build accessible web apps. I enjoy teaching.'
  },
  skills: [
    { name: 'Python', category: 'technical', claimed: 3, demonstrated: 3 },
    { name: 'ReactJS', category: 'technical', claimed: 3, demonstrated: 2 },
    { name: 'CSS', category: 'technical', claimed: 3, demonstrated: 0 },
    { name: 'Git', category: 'tool', claimed: 2, demonstrated: 2 },
    { name: 'Communication', category: 'soft', claimed: 3, demonstrated: 0 },
    { name: 'Docker', category: 'tool', claimed: 0, demonstrated: 0 }
  ],
  work: [
    {
      company: 'Initech',
      role: 'Intern',
      startDate: '2025-06',
      endDate: '2025-12',
      description: '- Wrote Python scripts for reports\n- Built a React dashboard with CSS grid\n- Helped the support team'
    }
  ],
  education: [{ institution: 'Pune University', qualification: 'B.E.', fieldOfStudy: 'Computer Engineering', startDate: '2022-08', endDate: '' }],
  certifications: [{ name: 'AWS Cloud Practitioner', issuer: 'Amazon', issueDate: '2025-03-10' }],
  projects: [
    { name: 'Data cleaner', technologies: 'Python, pandas', description: 'Cleans CSV files.', completedOn: '2025-02-01' },
    { name: 'Portfolio site', technologies: 'React, CSS', description: 'My portfolio. It is responsive.', repoUrl: 'https://github.com/asha/site' },
    { name: 'Chat bot', technologies: 'Python', description: 'A bot.' },
    { name: 'Game', technologies: 'C', description: 'A game.' },
    { name: 'Notes', technologies: 'Java', description: 'Notes app.' }
  ]
}

const job = {
  title: 'React Developer',
  description: 'Must have: React, JavaScript, CSS, Git. Nice to have: TypeScript.'
}

describe('bulletsFrom', () => {
  it('splits lines, list marks, and sentences', () => {
    expect(bulletsFrom('- One\n* Two\n3. Three')).toEqual(['One', 'Two', 'Three'])
    expect(bulletsFrom('Built a site. It is fast. Users love it.')).toEqual(['Built a site.', 'It is fast.', 'Users love it.'])
    expect(bulletsFrom('')).toEqual([])
  })
})

describe('buildResume, general', () => {
  const resume = buildResume(source)

  it('uses your details and puts your strongest skills first', () => {
    expect(resume.name).toBe('Asha Rao')
    expect(resume.contact).toEqual(['asha@example.com', '+91 90000 00000', 'Pune'])
    expect(resume.skills[0]).toEqual({ group: 'Technical', items: ['Python', 'ReactJS', 'CSS'] })
    expect(resume.skills.map((group) => group.group)).toEqual(['Technical', 'Tools', 'Soft skills'])
    expect(resume.keywords).toBeNull()
  })

  it('leaves out skills you have no level in', () => {
    expect(resumeText(resume)).not.toContain('Docker')
  })

  it('writes the summary only from what you entered', () => {
    expect(resume.summary).toBe('Frontend Developer skilled in Python, ReactJS, Git and CSS. I build accessible web apps.')
  })

  it('formats roles, education, projects, and certifications', () => {
    expect(resume.experience[0]).toEqual({
      heading: 'Intern',
      subheading: 'Initech',
      dates: 'Jun 2025 – Dec 2025',
      bullets: ['Wrote Python scripts for reports', 'Built a React dashboard with CSS grid', 'Helped the support team']
    })
    expect(resume.education[0]).toMatchObject({ heading: 'B.E., Computer Engineering', dates: 'Aug 2022 – Expected' })
    expect(resume.certifications).toEqual(['AWS Cloud Practitioner · Amazon · Mar 2025'])
    expect(resume.projects).toHaveLength(4)
    expect(resume.projects[0]!.heading).toBe('Data cleaner')
    expect(resume.projects[1]!.link).toBe('https://github.com/asha/site')
  })
})

describe('buildResume, tailored to a job', () => {
  const resume = buildResume(source, job)

  it("puts the job's skills first", () => {
    expect(resume.skills[0]!.items.slice(0, 2)).toEqual(['ReactJS', 'CSS'])
  })

  it('picks the most relevant projects first, and orders points by relevance', () => {
    expect(resume.projects[0]!.heading).toBe('Portfolio site')
    expect(resume.experience[0]!.bullets[0]).toBe('Built a React dashboard with CSS grid')
  })

  it('checks keyword coverage, without claiming what is missing', () => {
    expect(resume.keywords).toEqual({ matched: ['React', 'CSS', 'Git'], missing: ['JavaScript', 'TypeScript'], coverage: 60 })
    expect(resumeText(resume)).not.toContain('TypeScript')
  })

  it('uses the job title as a headline when you have none', () => {
    const plain = buildResume({ ...source, profile: { fullName: 'A' } }, job)
    expect(plain.headline).toBe('React Developer')
  })
})

describe('keywordCoverage', () => {
  it('is zero for a job with no recognised skills', () => {
    expect(keywordCoverage(buildResume(source), [])).toEqual({ matched: [], missing: [], coverage: 0 })
  })
})

describe('addsUnclaimedSkill', () => {
  const yours = ['React', 'CSS']

  it('allows rewording that keeps to your skills', () => {
    expect(addsUnclaimedSkill('Built a dashboard', 'Built a responsive React dashboard with CSS', yours)).toBeNull()
  })

  it('allows skills already in the original line', () => {
    expect(addsUnclaimedSkill('Wrote Python scripts', 'Automated reports with Python scripts', yours)).toBeNull()
  })

  it('catches a skill you never claimed', () => {
    expect(addsUnclaimedSkill('Built a dashboard', 'Built a dashboard in React with Kubernetes', yours)).toBe('Kubernetes')
  })
})

describe('parseResumeData', () => {
  it('accepts a resume the builder made', () => {
    const resume = buildResume(source, job)
    expect(parseResumeData(JSON.parse(JSON.stringify(resume)))).toEqual(resume)
  })

  it.each([
    ['nothing', null],
    ['a string', 'resume'],
    ['a missing section', { ...buildResume(source), projects: undefined }],
    ['a script link', { ...buildResume(source), projects: [{ heading: 'x', subheading: '', dates: '', bullets: [], link: 'javascript:alert(1)' }] }],
    ['a huge field', { ...buildResume(source), summary: 'x'.repeat(5000) }],
    ['too many points', { ...buildResume(source), experience: [{ heading: 'x', subheading: '', dates: '', bullets: Array(50).fill('y') }] }],
    ['a number where text belongs', { ...buildResume(source), name: 5 }]
  ])('refuses %s', (_label, value) => {
    expect(parseResumeData(value)).toBeNull()
  })
})

describe('applySuggestion', () => {
  const resume = buildResume(source)

  it('changes only the line suggested', () => {
    const changed = applySuggestion(resume, {
      id: 'experience-0-1',
      section: 'experience',
      entry: 0,
      bullet: 1,
      original: 'Built a React dashboard with CSS grid',
      reworded: 'Built a responsive React dashboard using CSS grid'
    })
    expect(changed.experience[0]!.bullets).toEqual([
      'Wrote Python scripts for reports',
      'Built a responsive React dashboard using CSS grid',
      'Helped the support team'
    ])
    expect(resume.experience[0]!.bullets[1]).toBe('Built a React dashboard with CSS grid')
  })

  it('changes the summary', () => {
    expect(applySuggestion(resume, { id: 'summary', section: 'summary', entry: 0, bullet: 0, original: '', reworded: 'New' }).summary).toBe('New')
  })
})
