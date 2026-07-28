import { createHash, randomBytes } from 'node:crypto'
import { EmailTakenError, InvalidCredentialsError, InvalidRefreshTokenError } from '../errors.js'
import type { PrismaClient, User } from '../generated/prisma/client.js'
import type { UserService } from './user.service.js'

const REFRESH_TOKEN_BYTES = 32
const MS_PER_DAY = 24 * 60 * 60 * 1000

const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex')

type IssuedRefreshToken = { raw: string; expiresAt: Date }

export class AuthService {
	constructor(
		private readonly prisma: PrismaClient,
		private readonly users: UserService,
		private readonly refreshTokenTtlDays: number,
	) {}

	async register(input: { email: string; password: string; displayName?: string }): Promise<User> {
		if (await this.users.findByEmail(input.email)) throw new EmailTakenError(input.email)
		return this.users.createWithPassword(input)
	}

	async login(input: { email: string; password: string }): Promise<User> {
		const user = await this.users.findByEmail(input.email)
		if (!user || !(await this.users.verifyPassword(user, input.password))) {
			throw new InvalidCredentialsError()
		}
		return user
	}

	async issueRefreshToken(userId: string): Promise<IssuedRefreshToken> {
		const raw = randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
		const expiresAt = new Date(Date.now() + this.refreshTokenTtlDays * MS_PER_DAY)
		await this.prisma.refreshToken.create({
			data: { tokenHash: hashToken(raw), userId, expiresAt },
		})
		return { raw, expiresAt }
	}

	async rotateRefreshToken(raw: string): Promise<{ user: User; refresh: IssuedRefreshToken }> {
		const record = await this.prisma.refreshToken.findUnique({
			where: { tokenHash: hashToken(raw) },
			include: { user: true },
		})
		if (!record || record.revokedAt || record.expiresAt < new Date()) {
			throw new InvalidRefreshTokenError()
		}
		await this.prisma.refreshToken.update({
			where: { id: record.id },
			data: { revokedAt: new Date() },
		})
		return { user: record.user, refresh: await this.issueRefreshToken(record.userId) }
	}

	async revokeRefreshToken(raw: string): Promise<void> {
		await this.prisma.refreshToken.updateMany({
			where: { tokenHash: hashToken(raw), revokedAt: null },
			data: { revokedAt: new Date() },
		})
	}

	async findOrCreateDiscordUser(input: {
		providerAccountId: string
		email?: string | null
		emailVerified?: boolean
		displayName?: string | null
	}): Promise<User> {
		const existing = await this.prisma.oAuthAccount.findUnique({
			where: {
				provider_providerAccountId: {
					provider: 'discord',
					providerAccountId: input.providerAccountId,
				},
			},
			include: { user: true },
		})
		if (existing) return existing.user

		const linkable =
			input.email && input.emailVerified ? await this.users.findByEmail(input.email) : undefined
		if (linkable) {
			await this.prisma.oAuthAccount.create({
				data: {
					provider: 'discord',
					providerAccountId: input.providerAccountId,
					userId: linkable.id,
				},
			})
			return linkable
		}

		return this.prisma.user.create({
			data: {
				email: input.email || undefined,
				displayName: input.displayName || undefined,
				accounts: { create: { provider: 'discord', providerAccountId: input.providerAccountId } },
			},
		})
	}
}
