import type { Conversation, Message, PrismaClient } from '../generated/prisma/client.js'

type MessageRole = 'user' | 'assistant'

export type ConversationSummary = {
	id: string
	title: string | null
	updatedAt: Date
}

export const DEFAULT_HISTORY_LIMIT = 40

export class ConversationService {
	constructor(private readonly prisma: PrismaClient) {}

	list(userId: string): Promise<ConversationSummary[]> {
		return this.prisma.conversation.findMany({
			where: { userId },
			orderBy: { updatedAt: 'desc' },
			select: { id: true, title: true, updatedAt: true },
		})
	}

	create(userId: string, title?: string): Promise<Conversation> {
		return this.prisma.conversation.create({ data: { userId, title } })
	}

	findOwned(userId: string, id: string): Promise<Conversation | null> {
		return this.prisma.conversation.findFirst({ where: { id, userId } })
	}

	async loadMessages(conversationId: string, limit = DEFAULT_HISTORY_LIMIT, before?: Date): Promise<Message[]> {
		const rows = await this.prisma.message.findMany({
			where: { conversationId, ...(before ? { createdAt: { lt: before } } : {}) },
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: limit,
		})
		return rows.reverse()
	}

	async appendMessages(conversationId: string, messages: { role: MessageRole; content: string }[]): Promise<void> {
		/**
		 * Postgres CURRENT_TIMESTAMP is transaction-start time, so rows written together would
		 * share an identical createdAt and read back in arbitrary order. Stamp them explicitly.
		 */
		const base = Date.now()
		await this.prisma.$transaction([
			this.prisma.message.createMany({
				data: messages.map((message, index) => ({
					conversationId,
					role: message.role,
					content: message.content,
					createdAt: new Date(base + index),
				})),
			}),
			this.prisma.conversation.update({
				where: { id: conversationId },
				data: { updatedAt: new Date() },
			}),
		])
	}

	async remove(userId: string, id: string): Promise<boolean> {
		const { count } = await this.prisma.conversation.deleteMany({ where: { id, userId } })
		return count > 0
	}
}
