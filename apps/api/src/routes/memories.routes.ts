import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { db } from '../db.js'

const createMemoryBody = z.object({
	content: z.string().min(1),
	source: z.enum(['user', 'auto']),
})

const memoryParams = z.object({ id: z.string().min(1) })

export const memoryRoutes: FastifyPluginAsync = async (app) => {
	const routes = app.withTypeProvider<ZodTypeProvider>()
	app.addHook('preHandler', app.authenticate)

	routes.get('/', async (request) => {
		const memories = await db.memories.list(request.user.sub)
		return { memories }
	})

	routes.post('/', { schema: { body: createMemoryBody } }, async (request, reply) => {
		const memory = await db.memories.add(request.user.sub, request.body.content, request.body.source)
		return reply.status(201).send({ memory })
	})

	routes.delete('/:id', { schema: { params: memoryParams } }, async (request, reply) => {
		const removed = await db.memories.remove(request.user.sub, request.params.id)
		if (!removed) return reply.status(404).send({ error: 'Memory not found' })
		return { ok: true }
	})
}
