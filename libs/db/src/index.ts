import { createPrismaClient } from './client.js'
import { AuthService } from './services/auth.service.js'
import { ConversationService } from './services/conversation.service.js'
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
	const conversations = new ConversationService(prisma)
	return {
		users,
		auth,
		memories,
		conversations,
		healthCheck: async (): Promise<void> => {
			await prisma.$queryRaw`SELECT 1`
		},
		disconnect: () => prisma.$disconnect(),
	}
}

export { EmailTakenError, InvalidCredentialsError, InvalidRefreshTokenError } from './errors.js'
export type { Conversation, Memory, Message, User } from './generated/prisma/client.js'
export { AuthService } from './services/auth.service.js'
export type { ConversationSummary } from './services/conversation.service.js'
export { ConversationService, DEFAULT_HISTORY_LIMIT } from './services/conversation.service.js'
export { MemoryService } from './services/memory.service.js'
export { UserService } from './services/user.service.js'
