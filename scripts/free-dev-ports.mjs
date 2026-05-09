import { execSync } from 'node:child_process'

/** Ports Vite may use when the default is busy; free them so the next dev run binds to 5173. */
const PORTS = [5173, 5174, 5175, 5176]

for (const port of PORTS) {
  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim()
    if (!out) {
      continue
    }
    for (const pid of out.split(/\s+/)) {
      if (!pid) {
        continue
      }
      try {
        process.kill(Number(pid), 'SIGKILL')
      } catch {
        // process already gone or no permission
      }
    }
  } catch {
    // lsof found nothing (exit != 0)
  }
}
