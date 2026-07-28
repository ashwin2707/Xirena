import type { Memory, PrismaClient } from '../generated/prisma/client.js'

type MemorySource = 'user' | 'auto'

export class MemoryService {
	constructor(private readonly prisma: PrismaClient) {}

	list(userId: string): Promise<Memory[]> {
		return this.prisma.memory.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
		})
	}

	add(userId: string, content: string, source: MemorySource): Promise<Memory> {
		return this.prisma.memory.create({ data: { userId, content, source } })
	}

	async remove(userId: string, id: string): Promise<boolean> {
		const { count } = await this.prisma.memory.deleteMany({ where: { id, userId } })
		return count > 0
	}
}
