import type { AbortOptions, Audio } from '../types.js'
import type { TTSProvider } from './types.js'

const DEFAULT_MODEL = 'eleven_flash_v2_5'
const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL'
const DEFAULT_OUTPUT_FORMAT = 'mp3_22050_32'
const DEFAULT_WS_URL = 'wss://api.elevenlabs.io'

type ElevenLabsConfig = {
	apiKey: string
	model?: string
	voice?: string
	outputFormat?: string
	wsUrl?: string
}

export class ElevenLabsTTS implements TTSProvider {
	readonly name = 'elevenLabs'
	private readonly apiKey: string
	private readonly model: string
	private readonly voice: string
	private readonly outputFormat: string
	private readonly wsUrl: string
	private readonly encoding: 'mp3' | 'pcm16'

	constructor(config: ElevenLabsConfig) {
		this.apiKey = config.apiKey
		this.model = config.model ?? DEFAULT_MODEL
		this.voice = config.voice ?? DEFAULT_VOICE
		this.outputFormat = config.outputFormat ?? DEFAULT_OUTPUT_FORMAT
		this.wsUrl = config.wsUrl ?? DEFAULT_WS_URL
		this.encoding = encodingFromFormat(this.outputFormat)
	}

	synthesizeStreamingInput(
		textStream: AsyncIterable<string>,
		opts?: AbortOptions,
	): AsyncIterable<Audio> {
		const url = new URL(`${this.wsUrl}/v1/text-to-speech/${this.voice}/stream-input`)
		url.searchParams.set('model_id', this.model)
		url.searchParams.set('output_format', this.outputFormat)

		const queue: Audio[] = []
		let done = false
		let error: unknown = null
		let notify: (() => void) | null = null
		const wake = () => {
			const n = notify
			notify = null
			n?.()
		}

		const ws = new WebSocket(url)

		ws.addEventListener('open', () => {
			ws.send(
				JSON.stringify({
					text: ' ',
					voice_settings: { stability: 0.5, similarity_boost: 0.8 },
					xi_api_key: this.apiKey,
				}),
			)

			void (async () => {
				try {
					for await (const chunk of textStream) {
						if (ws.readyState !== WebSocket.OPEN) break
						if (chunk.length > 0) {
							ws.send(JSON.stringify({ text: chunk, try_trigger_generation: true }))
						}
					}
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ text: '' }))
					}
				} catch (err) {
					error = err
					if (ws.readyState === WebSocket.OPEN) ws.close()
					wake()
				}
			})()
		})

		ws.addEventListener('message', (event) => {
			if (typeof event.data !== 'string') return
			try {
				const msg = JSON.parse(event.data) as {
					audio?: string
					isFinal?: boolean
					error?: string
				}
				if (msg.error) {
					error = new Error(`elevenLabs: ${msg.error}`)
					done = true
					ws.close()
					wake()
					return
				}
				if (msg.audio) {
					queue.push({
						data: new Uint8Array(Buffer.from(msg.audio, 'base64')),
						format: { encoding: this.encoding },
					})
					wake()
				}
				if (msg.isFinal) {
					done = true
					ws.close()
					wake()
				}
			} catch {
				// ignore non-JSON
			}
		})

		ws.addEventListener('error', () => {
			error = new Error('elevenLabs: websocket error')
			done = true
			wake()
		})

		ws.addEventListener('close', () => {
			done = true
			wake()
		})

		opts?.signal?.addEventListener(
			'abort',
			() => {
				try {
					ws.close()
				} catch {}
				done = true
				wake()
			},
			{ once: true },
		)

		return {
			async *[Symbol.asyncIterator]() {
				try {
					while (true) {
						while (queue.length > 0) yield queue.shift() as Audio
						if (error) throw error
						if (done) return
						await new Promise<void>((r) => {
							notify = r
						})
					}
				} finally {
					if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
						ws.close()
					}
				}
			},
		}
	}
}

const encodingFromFormat = (format: string): 'mp3' | 'pcm16' => {
	if (format.startsWith('mp3')) return 'mp3'
	if (format.startsWith('pcm')) return 'pcm16'
	throw new Error(`unsupported ElevenLabs output_format: ${format}`)
}
