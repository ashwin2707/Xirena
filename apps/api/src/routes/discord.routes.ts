import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../db.js'
import { env } from '../env.js'
import { setRefreshCookie } from '../session.js'

const discordProfile = z.object({
	id: z.string().min(1),
	username: z.string().min(1).optional(),
	email: z.email().nullable().optional(),
	verified: z.boolean().optional(),
})

export const discordRoutes: FastifyPluginAsync = async (app) => {
	app.get('/discord/callback', async (request, reply) => {
		const { token } = await app.discordOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply)

		const res = await fetch('https://discord.com/api/users/@me', {
			headers: { authorization: `Bearer ${token.access_token}` },
		})
		if (!res.ok) return reply.status(502).send({ error: 'Failed to fetch Discord profile' })
		const parsed = discordProfile.safeParse(await res.json())
		if (!parsed.success) {
			request.log.error({ issues: parsed.error.issues }, 'unexpected Discord profile shape')
			return reply.status(502).send({ error: 'Failed to fetch Discord profile' })
		}

		const profile = parsed.data
		const user = await db.auth.findOrCreateDiscordUser({
			providerAccountId: profile.id,
			email: profile.email,
			emailVerified: profile.verified === true,
			displayName: profile.username,
		})

		const refresh = await db.auth.issueRefreshToken(user.id)
		setRefreshCookie(reply, refresh.raw, refresh.expiresAt)
		return reply.redirect(`${env.WEB_ORIGIN}/auth/callback`)
	})
}
