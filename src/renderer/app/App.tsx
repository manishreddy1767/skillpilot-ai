import { useState } from 'react'
import type { RecordKind } from '../../shared/career'
import { ProfileForm } from './ProfileForm'
import { RecordEditor } from './RecordEditor'
import './app.css'

type Section = 'profile' | RecordKind

const sections: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'education', label: 'Education' },
  { id: 'work', label: 'Experience' },
  { id: 'certification', label: 'Certifications' }
]

const editors = {
  education: {
    title: 'Education',
    addLabel: 'Add education',
    emptyText: 'Add your degrees, diplomas, and courses.'
  },
  work: {
    title: 'Experience',
    addLabel: 'Add experience',
    emptyText: 'Add jobs, internships, and other work experience.'
  },
  certification: {
    title: 'Certifications',
    addLabel: 'Add certification',
    emptyText: 'Add certifications you have earned.'
  }
}

export function App() {
  const [section, setSection] = useState<Section>('profile')

  return (
    <div className="shell">
      <div className="titlebar">
        <span>SkillPilot AI</span>
        <button type="button" onClick={() => window.skillpilot.minimizeToWidget()}>
          Minimize to widget
        </button>
      </div>
      <div className="body">
        <nav aria-label="Sections">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <main>
          {section === 'profile' ? (
            <ProfileForm />
          ) : (
            <RecordEditor key={section} kind={section} {...editors[section]} />
          )}
        </main>
      </div>
    </div>
  )
}
