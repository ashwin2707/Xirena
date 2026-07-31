import { once } from 'node:events'
import { PassThrough } from 'node:stream'
import type { FastifyReply } from 'fastify'

export type VoiceEvent =
	| { type: 'transcript'; text: string }
	| { type: 'delta'; text: string }
	| { type: 'audio'; b64: string }
	| { type: 'done' }
	| { type: 'error'; message: string }

/**
 * Hand Fastify a stream rather than writing to reply.raw — reply.raw.writeHead would
 * bypass the reply's pending headers and silently drop the CORS headers that
 * @fastify/cors set in its onRequest hook, breaking the browser client.
 */
export const openSseStream = (reply: FastifyReply): PassThrough => {
	const stream = new PassThrough()
	reply
		.header('Content-Type', 'text/event-stream')
		.header('Cache-Control', 'no-cache, no-transform')
		.header('X-Accel-Buffering', 'no')
		.send(stream)
	return stream
}

export const writeEvent = async (stream: PassThrough, event: VoiceEvent): Promise<void> => {
	if (stream.destroyed || stream.writableEnded) return
	if (!stream.write(`data: ${JSON.stringify(event)}\n\n`)) {
		await once(stream, 'drain')
	}
}
