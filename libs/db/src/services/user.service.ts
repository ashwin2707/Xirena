import { hash, verify } from '@node-rs/argon2'
import type { PrismaClient, User } from '../generated/prisma/client.js'

export class UserService {
	constructor(private readonly prisma: PrismaClient) {}

	findById(id: string): Promise<User | null> {
		return this.prisma.user.findUnique({ where: { id } })
	}

	findByEmail(email: string): Promise<User | null> {
		return this.prisma.user.findUnique({ where: { email } })
	}

	async createWithPassword(input: { email: string; password: string; displayName?: string }): Promise<User> {
		const passwordHash = await hash(input.password)
		return this.prisma.user.create({
			data: { email: input.email, passwordHash, displayName: input.displayName },
		})
	}

	verifyPassword(user: User, password: string): Promise<boolean> {
		if (!user.passwordHash) return Promise.resolve(false)
		return verify(user.passwordHash, password)
	}
}
