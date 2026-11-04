import pg from 'pg'

export type Db = Pick<pg.Pool, 'query'> & { end?: () => Promise<void> }

export function createPool(url = process.env.DATABASE_URL): pg.Pool {
  if (!url) throw new Error('DATABASE_URL is not set')
  return new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 })
}
