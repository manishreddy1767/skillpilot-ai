import { createRoot } from 'react-dom/client'
import './app.css'

function App() {
  return (
    <div className="shell">
      <div className="titlebar">
        <span>SkillPilot AI</span>
        <button type="button" onClick={() => window.skillpilot.minimizeToWidget()}>
          Minimize to widget
        </button>
      </div>
      <main>
        <h1>Welcome to SkillPilot AI</h1>
        <p>Your profile, skills, goals, and projects will appear here.</p>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
