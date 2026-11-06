// VS Code terminals can inherit ELECTRON_RUN_AS_NODE=1, which makes Electron run
// as plain Node. Clear it so `npm run dev` works from any terminal.
import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const command = process.argv[2] ?? 'dev'
spawn('npx', ['electron-vite', command], { stdio: 'inherit', env, shell: true }).on('exit', (code) =>
  process.exit(code ?? 0)
)
