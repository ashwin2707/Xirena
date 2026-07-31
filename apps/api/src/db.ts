import { createDb } from '@xirena/db'
import { env } from './env.js'

export const db = createDb({
	databaseUrl: env.DATABASE_URL,
	refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
})
