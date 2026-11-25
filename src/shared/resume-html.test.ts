import { describe, expect, it } from 'vitest'
import type { ResumeData } from './resume'
import { escapeHtml, resumeBody, resumeDocument, resumePlainText } from './resume-html'

const data: ResumeData = {
  name: 'Asha <Rao>',
  headline: 'Frontend Developer',
  contact: ['asha@example.com', 'Pune'],
  summary: 'I build "fast" & accessible apps.',
  skills: [{ group: 'Technical', items: ['React', 'C#'] }],
  experience: [{ heading: 'Intern', subheading: 'Initech', dates: 'Jun 2025 – Dec 2025', bullets: ['Built <script>alert(1)</script> nothing'] }],
  projects: [
    { heading: 'Site', subheading: 'React', dates: '', bullets: [], link: 'https://github.com/asha/site' },
    { heading: 'Bad link', subheading: '', dates: '', bullets: [], link: 'javascript:alert(1)' }
  ],
  education: [],
  certifications: ['AWS Cloud Practitioner'],
  keywords: null
}

describe('escapeHtml', () => {
  it('escapes every character that could start markup', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  })
})

describe('resumeBody', () => {
  const html = resumeBody(data)

  it('escapes everything you typed, so it can never run', () => {
    expect(html).toContain('Asha &lt;Rao&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script')
    expect(html).toContain('I build &quot;fast&quot; &amp; accessible apps.')
  })

  it('uses standard sections and leaves empty ones out', () => {
    expect(html).toContain('<h2>Summary</h2>')
    expect(html).toContain('<h2>Experience</h2>')
    expect(html).not.toContain('<h2>Education</h2>')
  })

  it('shows only web links', () => {
    expect(html).toContain('https://github.com/asha/site')
    expect(html).not.toContain('javascript:')
  })
})

describe('resumeDocument', () => {
  it('is a full A4 page that can load nothing from anywhere', () => {
    const page = resumeDocument(data, 'classic')
    expect(page).toContain("default-src 'none'")
    expect(page).toContain('size: A4')
    expect(page).not.toMatch(/<link|<img|<script|https?:\/\/(?!github)/)
  })

  it('has two templates', () => {
    expect(resumeDocument(data, 'compact')).toContain('font: 9.5pt')
    expect(resumeDocument(data, 'classic')).toContain('font: 10.5pt')
  })
})

describe('resumePlainText', () => {
  it('reads cleanly for pasting into a job site', () => {
    expect(resumePlainText(data)).toBe(
      [
        'Asha <Rao>',
        'Frontend Developer',
        'asha@example.com | Pune',
        '',
        'SUMMARY',
        'I build "fast" & accessible apps.',
        '',
        'SKILLS',
        'Technical: React, C#',
        '',
        'EXPERIENCE',
        'Intern, Initech (Jun 2025 – Dec 2025)',
        '- Built <script>alert(1)</script> nothing',
        '',
        'PROJECTS',
        'Site, React',
        'Bad link',
        '',
        'CERTIFICATIONS',
        '- AWS Cloud Practitioner'
      ].join('\n')
    )
  })
})
