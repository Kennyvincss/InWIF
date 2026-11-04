import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool, type Db } from './pool'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations')

export async function migrate(db: Db) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  const done = new Set((await db.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version))
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue
    await db.query(readFileSync(path.join(dir, f), 'utf8'))
    await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [f])
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const pool = createPool()
  migrate(pool)
    .then(() => console.log('migrations applied'))
    .finally(() => pool.end())
}
