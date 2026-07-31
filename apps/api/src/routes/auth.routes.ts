import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { db } from '../db.js'
import { env } from '../env.js'
import { clearRefreshCookie, publicUser, readRefreshCookie, setRefreshCookie } from '../session.js'

const registerBody = z.object({
	email: z.email().max(256),
	password: z.string().min(8).max(128),
	displayName: z.string().min(1).max(128).optional(),
})

const loginBody = z.object({
	email: z.email(),
	password: z.string().min(1),
})

export const authRoutes: FastifyPluginAsync = async (app) => {
	const routes = app.withTypeProvider<ZodTypeProvider>()

	routes.post('/register', { schema: { body: registerBody } }, async (request, reply) => {
		const user = await db.auth.register(request.body)
		const accessToken = app.jwt.sign({ sub: user.id }, { expiresIn: env.ACCESS_TOKEN_TTL })
		const refresh = await db.auth.issueRefreshToken(user.id)
		setRefreshCookie(reply, refresh.raw, refresh.expiresAt)
		return reply.status(201).send({ accessToken, user: publicUser(user) })
	})

	routes.post('/login', { schema: { body: loginBody } }, async (request, reply) => {
		const user = await db.auth.login(request.body)
		const accessToken = app.jwt.sign({ sub: user.id }, { expiresIn: env.ACCESS_TOKEN_TTL })
		const refresh = await db.auth.issueRefreshToken(user.id)
		setRefreshCookie(reply, refresh.raw, refresh.expiresAt)
		return { accessToken, user: publicUser(user) }
	})

	routes.post('/refresh', async (request, reply) => {
		const raw = readRefreshCookie(request)
		if (!raw) return reply.status(401).send({ error: 'Missing refresh token' })
		const { user, refresh } = await db.auth.rotateRefreshToken(raw)
		const accessToken = app.jwt.sign({ sub: user.id }, { expiresIn: env.ACCESS_TOKEN_TTL })
		setRefreshCookie(reply, refresh.raw, refresh.expiresAt)
		return { accessToken, user: publicUser(user) }
	})

	routes.post('/logout', async (request, reply) => {
		const raw = readRefreshCookie(request)
		if (raw) await db.auth.revokeRefreshToken(raw)
		clearRefreshCookie(reply)
		return { ok: true }
	})

	routes.post('/logout-all', { preHandler: [app.authenticate] }, async (request, reply) => {
		await db.auth.revokeAllForUser(request.user.sub)
		clearRefreshCookie(reply)
		return { ok: true }
	})

	routes.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
		const user = await db.users.findById(request.user.sub)
		if (!user) return reply.status(404).send({ error: 'User not found' })
		return { user: publicUser(user) }
	})
}
