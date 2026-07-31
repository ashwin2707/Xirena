import type { Message } from '@xirena/ai'
import { Assistant } from '@xirena/ai'
import { DEFAULT_HISTORY_LIMIT } from '@xirena/db'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ai } from '../ai.js'
import { db } from '../db.js'
import { openSseStream, writeEvent } from '../sse.js'

const SYSTEM_PROMPT =
	'You are Xirena, a helpful voice assistant. Keep replies short and conversational - they will be spoken aloud.'

const MAX_AUDIO_BYTES = 8 * 1024 * 1024

const idParams = z.object({ id: z.string().min(1) })

export const voiceRoutes: FastifyPluginAsync = async (app) => {
	const routes = app.withTypeProvider<ZodTypeProvider>()
	app.addHook('preHandler', app.authenticate)

	routes.post(
		'/:id/voice',
		{
			bodyLimit: MAX_AUDIO_BYTES,
			schema: { params: idParams },
		},
		async (request, reply) => {
			const userId = request.user.sub
			const conversationId = request.params.id
			const startedAt = Date.now()
			let sttDoneAt = 0
			let firstAudioAt = 0
			let audioChunks = 0

			const audio = request.body
			if (!Buffer.isBuffer(audio) || audio.length === 0)
				return reply.status(400).send({ error: 'Expected a non-empty audio body' })

			const conversation = await db.conversations.findOwned(userId, conversationId)
			if (!conversation) return reply.status(404).send({ error: 'Conversation not found' })

			/** Stop paying for a reply nobody is listening to. */
			const controller = new AbortController()
			reply.raw.on('close', () => {
				if (!reply.raw.writableFinished) controller.abort()
			})
			const { signal } = controller
			const [transcript, historyRows, memoryRows] = await Promise.all([
				ai.stt.transcribe(
					{
						data: new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength),
						format: { encoding: encodingFor(request.headers['content-type']) },
					},
					{ signal },
				),
				db.conversations.loadMessages(conversationId, DEFAULT_HISTORY_LIMIT),
				db.memories.list(userId),
			])
			sttDoneAt = Date.now()

			const history: Message[] = historyRows.map((row) => ({
				role: row.role === 'assistant' ? 'assistant' : 'user',
				content: row.content,
			}))
			const memories = memoryRows.map((row) => row.content)

			const userText = transcript.trim()
			if (!userText) return reply.status(422).send({ error: 'No speech detected' })

			/** Everything above can still fail with a real status code. Past here we're streaming. */
			const stream = openSseStream(reply)
			await writeEvent(stream, { type: 'transcript', text: userText })

			const assistant = new Assistant(ai.llm, { system: SYSTEM_PROMPT })
			let replyText = ''

			const textStream = tee(assistant.send(userText, { history, memories }, { signal }), async (chunk) => {
				replyText += chunk
				await writeEvent(stream, { type: 'delta', text: chunk })
			})

			let completed = false
			try {
				for await (const chunk of ai.tts.synthesizeStreamingInput(textStream, { signal })) {
					if (audioChunks === 0) firstAudioAt = Date.now()
					audioChunks++
					await writeEvent(stream, { type: 'audio', b64: Buffer.from(chunk.data).toString('base64') })
				}
				if (signal.aborted) return

				const turn = [
					{ role: 'user', content: userText },
					{ role: 'assistant', content: replyText },
				] as const satisfies readonly Message[]

				await db.conversations.appendMessages(conversationId, [...turn])
				await writeEvent(stream, { type: 'done' })
				completed = true
				request.log.info(
					{
						userId,
						conversationId,
						sttMs: sttDoneAt - startedAt,
						ttfbMs: audioChunks > 0 ? firstAudioAt - sttDoneAt : null,
						totalMs: Date.now() - startedAt,
						transcriptChars: userText.length,
						replyChars: replyText.length,
						audioChunks,
					},
					'voice turn completed',
				)
			} catch (err) {
				request.log.error({ err, conversationId, userId }, 'voice turn failed')
				await writeEvent(stream, { type: 'error', message: 'Something went wrong generating a reply.' })
			} finally {
				stream.end()
				controller.abort()
			}

			if (!completed) return
			void (async () => {
				const facts = await assistant.extractFacts(userText, replyText, memories)
				await db.memories.addMany(userId, facts, 'auto')
			})().catch((err) => request.log.error({ err, userId, conversationId }, 'memory extraction failed'))
		},
	)
}

async function* tee(source: AsyncIterable<string>, onChunk: (chunk: string) => Promise<void>): AsyncIterable<string> {
	for await (const chunk of source) {
		await onChunk(chunk)
		yield chunk
	}
}

const encodingFor = (contentType: string | undefined): 'webm' | 'ogg' | 'm4a' | 'mp3' | 'wav' => {
	const type = contentType ?? ''
	if (type.includes('webm')) return 'webm'
	if (type.includes('ogg')) return 'ogg'
	if (type.includes('mp4') || type.includes('m4a')) return 'm4a'
	if (type.includes('mpeg') || type.includes('mp3')) return 'mp3'
	return 'wav'
}
