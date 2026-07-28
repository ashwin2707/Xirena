import { createPrismaClient } from './client.js'
import { AuthService } from './services/auth.service.js'
import { MemoryService } from './services/memory.service.js'
import { UserService } from './services/user.service.js'

export type DbConfig = {
	databaseUrl: string
	refreshTokenTtlDays: number
}

export const createDb = (config: DbConfig) => {
	const prisma = createPrismaClient(config.databaseUrl)
	const users = new UserService(prisma)
	const auth = new AuthService(prisma, users, config.refreshTokenTtlDays)
	const memories = new MemoryService(prisma)
	return {
		users,
		auth,
		memories,
		healthCheck: async (): Promise<void> => {
			await prisma.$queryRaw`SELECT 1`
		},
		disconnect: () => prisma.$disconnect(),
	}
}

export { EmailTakenError, InvalidCredentialsError, InvalidRefreshTokenError } from './errors.js'
export type { Memory, User } from './generated/prisma/client.js'
export { AuthService } from './services/auth.service.js'
export { MemoryService } from './services/memory.service.js'
export { UserService } from './services/user.service.js'
