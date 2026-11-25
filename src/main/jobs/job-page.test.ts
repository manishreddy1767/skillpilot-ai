import { describe, expect, it } from 'vitest'
import { decodeEntities, htmlFromMhtml, htmlToText, parseJobPage } from './job-page'

const posting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Junior React Developer',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Tech &amp; Co' },
  jobLocation: [{ '@type': 'Place', address: { addressLocality: 'Bengaluru', addressRegion: 'Karnataka' } }],
  url: 'https://www.linkedin.com/jobs/view/1234567',
  description: '<p>We need a <strong>React</strong> developer.</p><ul><li>JavaScript</li><li>REST APIs</li></ul><script>alert(1)</script>'
}

/** Structured data as job sites write it, with "</" escaped so it cannot end the script early. */
const ld = (value: unknown) => JSON.stringify(value).replace(/<\//g, '<\\/')

const linkedInPage = `<!DOCTYPE html><html><head>
<title>Junior React Developer - Acme Tech | LinkedIn</title>
<meta property="og:url" content="https://www.linkedin.com/jobs/view/1234567">
<script type="application/ld+json">${ld(posting)}</script>
<script>window.tracking = "should never matter"</script>
</head><body><div>Sign in to see more</div></body></html>`

describe('decodeEntities and htmlToText', () => {
  it('decodes named and numbered entities', () => {
    expect(decodeEntities('R&amp;D &lt;3 &#8377;5 &#x20B9; caf&eacute;')).toBe('R&D <3 ₹5 ₹ caf&eacute;')
  })

  it('keeps bullets and line breaks, and drops scripts and styles', () => {
    expect(htmlToText('<h2>Skills</h2><ul><li>SQL</li><li>Excel</li></ul><style>x{}</style><script>bad()</script><p>Apply&nbsp;now</p>')).toBe(
      'Skills\n- SQL\n- Excel\nApply now'
    )
  })
})

describe('parseJobPage', () => {
  it('reads a LinkedIn page from its structured job data', () => {
    expect(parseJobPage(linkedInPage)).toEqual({
      title: 'Junior React Developer',
      company: 'Acme Tech & Co',
      location: 'Bengaluru, Karnataka',
      source: 'linkedin',
      url: 'https://www.linkedin.com/jobs/view/1234567',
      description: 'We need a React developer.\n- JavaScript\n- REST APIs'
    })
  })

  it('finds a posting inside @graph, and marks a remote job', () => {
    const page = `<html><head><script type="application/ld+json">${ld({
      '@graph': [{ '@type': 'WebPage' }, { ...posting, jobLocationType: 'TELECOMMUTE', jobLocation: undefined, url: 'https://www.naukri.com/job-listings-x' }]
    })}</script></head><body></body></html>`
    expect(parseJobPage(page)).toMatchObject({ location: 'Remote', source: 'naukri' })
  })

  it('falls back to the page title and text when there is no structured data', () => {
    const page = `<html><head><title>Data Analyst - Globex - Pune | Naukri.com</title>
<link rel="canonical" href="https://www.naukri.com/job-listings-data-analyst-globex"></head>
<body><nav>Menu</nav><div><h1>Data Analyst</h1><p>Must have: SQL, Power BI</p></div></body></html>`
    expect(parseJobPage(page)).toMatchObject({
      title: 'Data Analyst',
      company: 'Globex',
      location: 'Pune',
      source: 'naukri',
      url: 'https://www.naukri.com/job-listings-data-analyst-globex'
    })
    expect(parseJobPage(page).description).toContain('Must have: SQL, Power BI')
  })

  it('survives broken structured data', () => {
    const page = `<html><head><title>QA Engineer | Indeed</title><script type="application/ld+json">{ not json</script></head><body><p>Selenium and Java</p></body></html>`
    expect(parseJobPage(page)).toMatchObject({ title: 'QA Engineer', description: 'Selenium and Java' })
  })

  it('reads a page saved as a single file (MHTML)', () => {
    const mhtml = [
      'From: <Saved by Blink>',
      'Snapshot-Content-Location: https://www.linkedin.com/jobs/view/42',
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="----MultipartBoundary--abc"',
      '',
      '------MultipartBoundary--abc',
      'Content-Type: text/html',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<html><head><title>Backend Developer - Initech | LinkedIn</title></head><body><p>Node.js and SQL =E2=80=93 Bengaluru=',
      ' office</p></body></html>',
      '------MultipartBoundary--abc--'
    ].join('\r\n')
    expect(htmlFromMhtml(mhtml)).toContain('Node.js and SQL – Bengaluru office')
    expect(parseJobPage(mhtml)).toMatchObject({ title: 'Backend Developer', company: 'Initech', source: 'linkedin' })
  })

  it('reads plain text, using the first line as the title', () => {
    expect(parseJobPage('Python Developer\n\nWe need Django and REST APIs.', 'job.txt')).toEqual({
      title: 'Python Developer',
      company: '',
      location: '',
      source: 'other',
      url: '',
      description: 'Python Developer\n\nWe need Django and REST APIs.'
    })
  })

  it('never keeps a link that is not a web address', () => {
    const page = linkedInPage.replaceAll('https://www.linkedin.com/jobs/view/1234567', 'javascript:alert(1)')
    expect(parseJobPage(page).url).toBe('')
  })

  it('caps very long descriptions', () => {
    expect(parseJobPage('Title\n' + 'x'.repeat(50_000)).description.length).toBe(20_000)
  })
})
