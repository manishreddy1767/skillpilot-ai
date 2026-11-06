import './overview.css'

const sections = [
  { title: 'Current goal', empty: 'No goal set yet' },
  { title: "Today's tasks", empty: 'Nothing planned for today' },
  { title: 'Learning now', empty: 'No skills in progress' },
  { title: 'Next deadline', empty: 'No upcoming deadlines' }
]

export function Overview() {
  return (
    <main className="panel">
      <header>
        <h1>SkillPilot AI</h1>
        <p>Your career at a glance</p>
      </header>
      {sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <p>{section.empty}</p>
        </section>
      ))}
      <button type="button" onClick={() => window.skillpilot.openApp()}>
        Open SkillPilot
      </button>
    </main>
  )
}
