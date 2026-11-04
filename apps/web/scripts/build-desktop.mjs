// Static export of the wallet for the Tauri desktop app. The desktop app has no
// InWIF server, so the server-only relays (src/app/api) are moved aside for the
// duration of the build and always restored afterwards.
import { existsSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const api = 'src/app/api'
const parked = '.api-parked'
if (existsSync(parked)) throw new Error(`${parked} exists — a previous desktop build was interrupted; move it back to ${api}.`)
renameSync(api, parked)
let code = 1
try {
  code = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_DESKTOP: '1', NEXT_TELEMETRY_DISABLED: '1' } }).status ?? 1
} finally {
  renameSync(parked, api)
}
process.exit(code)
