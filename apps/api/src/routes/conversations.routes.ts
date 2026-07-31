import { DEFAULT_HISTORY_LIMIT } from '@xirena/db'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { db } from '../db.js'

const createBody = z.object({ title: z.string().min(1).max(200).optional() })
const idParams = z.object({ id: z.string().min(1) })

export const conversationRoutes: FastifyPluginAsync = async (app) => {
	const routes = app.withTypeProvider<ZodTypeProvider>()
	app.addHook('preHandler', app.authenticate)
	const historyQuery = z.object({ before: z.coerce.date().optional() })

	routes.get('/', async (request) => {
		const conversations = await db.conversations.list(request.user.sub)
		return { conversations }
	})

	routes.post('/', { schema: { body: createBody } }, async (request, reply) => {
		const conversation = await db.conversations.create(request.user.sub, request.body.title)
		return reply.status(201).send({ conversation })
	})

	routes.get('/:id', { schema: { params: idParams, querystring: historyQuery } }, async (request, reply) => {
		const conversation = await db.conversations.findOwned(request.user.sub, request.params.id)
		if (!conversation) return reply.status(404).send({ error: 'Conversation not found' })
		const messages = await db.conversations.loadMessages(
			conversation.id,
			DEFAULT_HISTORY_LIMIT + 1,
			request.query.before,
		)
		const hasMore = messages.length > DEFAULT_HISTORY_LIMIT
		return { conversation, messages: hasMore ? messages.slice(1) : messages, hasMore }
	})

	routes.delete('/:id', { schema: { params: idParams } }, async (request, reply) => {
		const removed = await db.conversations.remove(request.user.sub, request.params.id)
		if (!removed) return reply.status(404).send({ error: 'Conversation not found' })
		return { ok: true }
	})
}
