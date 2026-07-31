import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import oauth2 from '@fastify/oauth2'
import { EmailTakenError, InvalidCredentialsError, InvalidRefreshTokenError } from '@xirena/db'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { db } from './db.js'
import { env } from './env.js'
import { authRoutes } from './routes/auth.routes.js'
import { conversationRoutes } from './routes/conversations.routes.js'
import { discordRoutes } from './routes/discord.routes.js'
import { memoryRoutes } from './routes/memories.routes.js'
import { voiceRoutes } from './routes/voice.routes.js'

const AUDIO_CONTENT_TYPES = [
	'audio/webm',
	'audio/ogg',
	'audio/mp4',
	'audio/mpeg',
	'audio/wav',
	'application/octet-stream',
]

export const buildServer = (): FastifyInstance => {
	const app = Fastify({ logger: env.NODE_ENV !== 'test' })

	app.register(cors, {
		origin: env.WEB_ORIGIN,
		credentials: true,
		methods: ['GET', 'POST', 'DELETE'],
	})

	app.setValidatorCompiler(validatorCompiler)
	app.setSerializerCompiler(serializerCompiler)
	app.register(cookie)
	app.register(jwt, { secret: env.JWT_SECRET })

	/** Accept raw audio bodies without pulling in multipart. */
	app.addContentTypeParser(AUDIO_CONTENT_TYPES, { parseAs: 'buffer' }, (_request, body, done) => {
		done(null, body)
	})

	app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			await request.jwtVerify()
		} catch {
			return reply.status(401).send({ error: 'Unauthorized' })
		}
	})

	app.setErrorHandler((err: FastifyError, request, reply) => {
		if (err.validation) {
			return reply.status(400).send({ error: 'Validation failed', details: err.validation })
		}
		if (err instanceof EmailTakenError) return reply.status(409).send({ error: err.message })
		if (err instanceof InvalidCredentialsError) return reply.status(401).send({ error: err.message })
		if (err instanceof InvalidRefreshTokenError) {
			return reply.status(401).send({ error: err.message })
		}
		request.log.error({ err }, 'unhandled error')
		return reply.status(500).send({ error: 'Internal Server Error' })
	})

	app.get('/health', async () => {
		await db.healthCheck()
		return { status: 'ok' }
	})

	if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_CALLBACK_URL) {
		app.register(oauth2, {
			name: 'discordOAuth2',
			scope: ['identify', 'email'],
			pkce: 'S256',
			cookie: { secure: env.NODE_ENV === 'production', sameSite: 'lax', httpOnly: true, path: '/auth' },
			credentials: {
				client: { id: env.DISCORD_CLIENT_ID, secret: env.DISCORD_CLIENT_SECRET },
				auth: oauth2.default.DISCORD_CONFIGURATION,
			},
			startRedirectPath: '/auth/discord',
			callbackUri: env.DISCORD_CALLBACK_URL,
		})
		app.register(discordRoutes, { prefix: '/auth' })
	}
	app.register(authRoutes, { prefix: '/auth' })
	app.register(memoryRoutes, { prefix: '/memories' })
	app.register(conversationRoutes, { prefix: '/conversations' })
	app.register(voiceRoutes, { prefix: '/conversations' })

	return app
}
