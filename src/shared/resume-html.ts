import type { ResumeData, ResumeEntry } from './resume'

export type ResumeTemplate = 'classic' | 'compact'

export const RESUME_TEMPLATES: { id: ResumeTemplate; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'compact', label: 'Compact (fits more on one page)' }
]

/** Every piece of your text is escaped, so nothing in it can act as markup or code. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STYLES: Record<ResumeTemplate, string> = {
  classic: `
    body { font: 10.5pt/1.4 'Calibri', 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; }
    .page { padding: 16mm 16mm; }
    h1 { font-size: 20pt; margin: 0; letter-spacing: 0.5px; }
    .headline { font-size: 11.5pt; color: #333; margin: 2px 0 4px; }
    .contact { color: #333; margin-bottom: 10px; }
    h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #555; margin: 12px 0 6px; padding-bottom: 2px; }
    .entry { margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .sub { color: #333; }
    ul { margin: 3px 0 0 18px; padding: 0; }
    li { margin: 1px 0; }
    p { margin: 0; }`,
  compact: `
    body { font: 9.5pt/1.3 'Calibri', 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; }
    .page { padding: 10mm 12mm; }
    h1 { font-size: 16pt; margin: 0; }
    .headline { font-size: 10pt; margin: 0; }
    .contact { color: #333; margin-bottom: 6px; }
    h2 { font-size: 10pt; text-transform: uppercase; border-bottom: 1px solid #888; margin: 8px 0 4px; }
    .entry { margin-bottom: 5px; }
    .row { display: flex; justify-content: space-between; gap: 10px; }
    .sub { color: #333; }
    ul { margin: 2px 0 0 16px; padding: 0; }
    li { margin: 0; }
    p { margin: 0; }`
}

const section = (title: string, body: string): string => (body ? `<h2>${escapeHtml(title)}</h2>${body}` : '')

const entry = (item: ResumeEntry): string => {
  const link = item.link && /^https?:\/\/\S+$/i.test(item.link) ? ` · ${escapeHtml(item.link)}` : ''
  const sub = [item.subheading].filter(Boolean).map(escapeHtml).join('')
  return `<div class="entry">
  <div class="row"><strong>${escapeHtml(item.heading)}</strong><span>${escapeHtml(item.dates)}</span></div>
  ${sub || link ? `<div class="sub">${sub}${link}</div>` : ''}
  ${item.bullets.length ? `<ul>${item.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : ''}
</div>`
}

/**
 * A plain, single-column page that applicant tracking systems read well: real text, standard
 * section names, no tables, images, or columns. The same HTML is shown in the app and printed to PDF.
 */
export function resumeBody(data: ResumeData): string {
  return `<div class="page">
<h1>${escapeHtml(data.name || 'Your name')}</h1>
${data.headline ? `<p class="headline">${escapeHtml(data.headline)}</p>` : ''}
${data.contact.length ? `<p class="contact">${data.contact.map(escapeHtml).join(' · ')}</p>` : ''}
${section('Summary', data.summary ? `<p>${escapeHtml(data.summary)}</p>` : '')}
${section('Skills', data.skills.map((group) => `<p><strong>${escapeHtml(group.group)}:</strong> ${group.items.map(escapeHtml).join(', ')}</p>`).join(''))}
${section('Experience', data.experience.map(entry).join(''))}
${section('Projects', data.projects.map(entry).join(''))}
${section('Education', data.education.map(entry).join(''))}
${section('Certifications', data.certifications.length ? `<ul>${data.certifications.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '')}
</div>`
}

/** A complete page for printing to PDF. It loads nothing from anywhere. */
export function resumeDocument(data: ResumeData, template: ResumeTemplate): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(data.name || 'Resume')}</title>
<style>@page { size: A4; margin: 0; } ${STYLES[template]}</style>
</head><body>${resumeBody(data)}</body></html>`
}

/** The same resume as plain text, for job sites that ask you to paste it. */
export function resumePlainText(data: ResumeData): string {
  const lines: string[] = [data.name, data.headline, data.contact.join(' | ')].filter(Boolean)
  const block = (title: string, body: string[]): void => {
    if (body.length === 0) return
    lines.push('', title.toUpperCase(), ...body)
  }
  const entries = (items: ResumeEntry[]): string[] =>
    items.flatMap((item) => [
      [item.heading, item.subheading].filter(Boolean).join(', ') + (item.dates ? ` (${item.dates})` : ''),
      ...item.bullets.map((bullet) => `- ${bullet}`)
    ])
  block('Summary', data.summary ? [data.summary] : [])
  block('Skills', data.skills.map((group) => `${group.group}: ${group.items.join(', ')}`))
  block('Experience', entries(data.experience))
  block('Projects', entries(data.projects))
  block('Education', entries(data.education))
  block('Certifications', data.certifications.map((item) => `- ${item}`))
  return lines.join('\n')
}
