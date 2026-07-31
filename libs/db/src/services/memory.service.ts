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
		return this.prisma.memory.upsert({
			where: { userId_content: { userId, content } },
			update: {},
			create: { userId, content, source },
		})
	}

	async addMany(userId: string, contents: string[], source: MemorySource): Promise<number> {
		if (contents.length === 0) return 0
		const { count } = await this.prisma.memory.createMany({
			data: contents.map((content) => ({ userId, content, source })),
			skipDuplicates: true,
		})
		return count
	}

	async remove(userId: string, id: string): Promise<boolean> {
		const { count } = await this.prisma.memory.deleteMany({ where: { id, userId } })
		return count > 0
	}
}
