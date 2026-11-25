import { describe, expect, it } from 'vitest'
import { experienceAsked, jobSearchUrl, matchJob, splitRequirements } from './job-match'

const description = `About the role
We are looking for a Frontend Developer to join our product team in Pune.

Must have:
- Strong JavaScript and React.js
- HTML, CSS, responsive design
- REST APIs and Git
- 1-3 years of experience

Nice to have:
- TypeScript
- Next.js
- Jest

Freshers with strong projects may also apply.`

const skills = [
  { name: 'ReactJS', claimed: 3, demonstrated: 2 },
  { name: 'JavaScript', claimed: 3, demonstrated: 0 },
  { name: 'HTML', claimed: 4, demonstrated: 3 },
  { name: 'TypeScript', claimed: 2, demonstrated: 1 }
]

describe('splitRequirements', () => {
  it('separates what is required from what is preferred', () => {
    const { required, preferred } = splitRequirements(description)
    expect(required).toContain('React.js')
    expect(required).not.toContain('Next.js')
    expect(preferred).toContain('Next.js')
  })
})

describe('experienceAsked', () => {
  it.each([
    ['1-3 years of experience', '1-3'],
    ['Experience: 2 to 5 yrs', '2-5'],
    ['3+ years in backend', '3+'],
    ['Minimum 4 years of experience', '4'],
    ['We love coffee', null]
  ])('"%s" asks for %s', (text, years) => {
    expect(experienceAsked(text)).toBe(years)
  })
})

describe('matchJob', () => {
  const match = matchJob('Frontend Developer', description, skills)

  it('finds what the job asks for, essential skills first', () => {
    const essential = match.skills.filter((skill) => skill.essential).map((skill) => skill.name)
    expect(essential).toEqual(expect.arrayContaining(['JavaScript', 'React', 'HTML', 'CSS', 'REST APIs', 'Git']))
    expect(essential).not.toContain('Next.js')
    expect(match.skills.find((skill) => skill.name === 'Next.js')).toMatchObject({ essential: false, fit: 'missing' })
  })

  it('knows proven, claimed, and missing skills, under any name', () => {
    const fit = Object.fromEntries(match.skills.map((skill) => [skill.name, skill.fit]))
    expect(fit['React']).toBe('proven')
    expect(fit['JavaScript']).toBe('claimed')
    expect(fit['CSS']).toBe('missing')
    expect(match.missing).toEqual(expect.arrayContaining(['CSS', 'Git', 'REST APIs', 'Next.js', 'Jest']))
  })

  it('scores essential skills higher, and proven above claimed', () => {
    expect(match.score).toBeGreaterThan(0)
    expect(match.score).toBeLessThan(100)
    const everything = matchJob('Frontend Developer', description, [
      'JavaScript', 'React', 'HTML', 'CSS', 'Responsive design', 'REST APIs', 'Git', 'TypeScript', 'Next.js', 'Jest', 'Frontend'
    ].map((name) => ({ name, claimed: 3, demonstrated: 3 })))
    expect(everything.score).toBe(100)
    const claimedOnly = matchJob('Frontend Developer', description, [
      'JavaScript', 'React', 'HTML', 'CSS', 'Responsive design', 'REST APIs', 'Git', 'TypeScript', 'Next.js', 'Jest'
    ].map((name) => ({ name, claimed: 3, demonstrated: 0 })))
    expect(claimedOnly.score).toBe(60)
  })

  it('reads the experience asked, spots entry-level jobs, and the closest library role', () => {
    expect(match.experience).toBe('1-3')
    expect(match.entryLevel).toBe(true)
    expect(match.role?.id).toBe('frontend-developer')
    expect(matchJob('Senior Java Developer', 'Need 6+ years of Java', []).entryLevel).toBe(false)
  })

  it('scores 0 when the description names no skills it knows', () => {
    expect(matchJob('Chef', 'Cook tasty food', [])).toMatchObject({ score: 0, skills: [], missing: [] })
  })
})

describe('jobSearchUrl', () => {
  it.each([
    ['linkedin', 'https://www.linkedin.com/jobs/search/?keywords=React%20developer&location=Pune'],
    ['naukri', 'https://www.naukri.com/react-developer-jobs-in-pune?k=React%20developer&l=Pune'],
    ['indeed', 'https://in.indeed.com/jobs?q=React%20developer&l=Pune'],
    ['foundit', 'https://www.foundit.in/srp/results?query=React%20developer&locations=Pune']
  ] as const)('builds the %s search', (site, url) => {
    expect(jobSearchUrl(site, ' React developer ', 'Pune')).toBe(url)
  })

  it('leaves the location out when there is none, and encodes safely', () => {
    expect(jobSearchUrl('linkedin', 'C# & .NET')).toBe('https://www.linkedin.com/jobs/search/?keywords=C%23%20%26%20.NET')
    expect(jobSearchUrl('naukri', 'C# & .NET')).toBe('https://www.naukri.com/c-net-jobs?k=C%23%20%26%20.NET')
  })
})
