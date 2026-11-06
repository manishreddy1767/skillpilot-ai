import { useState } from 'react'
import { AssistantView } from './AssistantView'
import { DashboardView } from './DashboardView'
import { GoalsView } from './GoalsView'
import { ProfileForm } from './ProfileForm'
import { ProjectsView } from './ProjectsView'
import { RecordEditor } from './RecordEditor'
import { RoadmapsView } from './RoadmapsView'
import { RolesView } from './RolesView'
import { SettingsView } from './SettingsView'
import { SkillsView } from './SkillsView'
import { TasksView } from './TasksView'
import './app.css'

type Section =
  | 'dashboard'
  | 'assistant'
  | 'roles'
  | 'roadmaps'
  | 'settings'
  | 'tasks'
  | 'skills'
  | 'goals'
  | 'projects'
  | 'profile'
  | 'education'
  | 'work'
  | 'certification'

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

function Screen({ section }: { section: Section }) {
  switch (section) {
    case 'dashboard':
      return <DashboardView />
    case 'tasks':
      return <TasksView />
    case 'assistant':
      return <AssistantView />
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
        />
      )
  }
}

export function App() {
  const [section, setSection] = useState<Section>('dashboard')

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
          <Screen section={section} />
        </main>
      </div>
    </div>
  )
}
