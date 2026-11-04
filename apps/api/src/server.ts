import { buildApp } from './app'
import { createPool } from './db/pool'
import { migrate } from './db/migrate'

const pool = createPool()
await migrate(pool)
const app = await buildApp({
  db: pool,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
  redisUrl: process.env.REDIS_URL,
  logger: true,
})
await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' })
