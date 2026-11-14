import { useState } from 'react'
import { RobotIcon } from '../RobotIcon'
import { AssistantView } from './AssistantView'
import { DashboardView } from './DashboardView'
import { LinkPicker } from './LinkPicker'
import { GoalsView } from './GoalsView'
import { ProfileForm } from './ProfileForm'
import { ProjectsView } from './ProjectsView'
import { RecordEditor } from './RecordEditor'
import { RoadmapsView } from './RoadmapsView'
import { RolesView } from './RolesView'
import { SettingsView } from './SettingsView'
import { SkillsView } from './SkillsView'
import { TasksView } from './TasksView'
import type { SectionId } from '../../shared/voice-commands'
import './app.css'

type Section = SectionId

const sections: { id: Section; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'skills', label: 'Skills' },
  { id: 'goals', label: 'Goals' },
  { id: 'projects', label: 'Projects' },
  { id: 'roles', label: 'Target roles' },
  { id: 'roadmaps', label: 'Roadmaps' },
  { id: 'profile', label: 'Profile' },
  { id: 'education', label: 'Education' },
  { id: 'work', label: 'Experience' },
  { id: 'certification', label: 'Certifications' },
  { id: 'settings', label: 'Settings' }
]

function Screen({ section, onNavigate }: { section: Section; onNavigate: (section: Section, note: string) => void }) {
  switch (section) {
    case 'dashboard':
      return <DashboardView />
    case 'tasks':
      return <TasksView />
    case 'assistant':
      return <AssistantView onNavigate={onNavigate} />
    case 'roles':
      return <RolesView />
    case 'roadmaps':
      return <RoadmapsView />
    case 'settings':
      return <SettingsView />
    case 'skills':
      return <SkillsView />
    case 'goals':
      return <GoalsView />
    case 'projects':
      return <ProjectsView />
    case 'profile':
      return <ProfileForm />
    case 'education':
      return (
        <RecordEditor
          key="education"
          kind="education"
          title="Education"
          addLabel="Add education"
          emptyText="Add your degrees, diplomas, and courses."
        />
      )
    case 'work':
      return (
        <RecordEditor
          key="work"
          kind="work"
          title="Experience"
          addLabel="Add experience"
          emptyText="Add jobs, internships, and other work experience."
          details={(record) => (
            <LinkPicker
              link="workSkill"
              parentId={record.id}
              optionKind="skill"
              title="Skills used in this role"
              emptyText="Add skills first, then choose the ones you used here. Each counts as strong evidence."
            />
          )}
        />
      )
    case 'certification':
      return (
        <RecordEditor
          key="certification"
          kind="certification"
          title="Certifications"
          addLabel="Add certification"
          emptyText="Add certifications you have earned."
          details={(record) => (
            <LinkPicker
              link="certificationSkill"
              parentId={record.id}
              optionKind="skill"
              title="Skills this certifies"
              emptyText="Add skills first, then choose the ones this certification covers. Each counts as solid evidence."
            />
          )}
        />
      )
  }
}

export function App() {
  const [section, setSection] = useState<Section>('dashboard')
  const [note, setNote] = useState('')

  const go = (next: Section, why = ''): void => {
    setSection(next)
    setNote(why)
  }

  return (
    <div className="shell">
      <div className="titlebar">
        <span className="brand">
          <RobotIcon />
          SkillPilot AI
        </span>
        <span className="online">Ready to help</span>
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
              onClick={() => go(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <main>
          {note ? (
            <div className="voice-note" role="status">
              <span>{note}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setNote('')}>
                ×
              </button>
            </div>
          ) : null}
          <Screen section={section} onNavigate={go} />
        </main>
      </div>
    </div>
  )
}
