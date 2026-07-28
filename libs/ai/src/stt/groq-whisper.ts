import Groq, { toFile } from 'groq-sdk'
import type { AbortOptions, Audio } from '../types.js'
import type { STTProvider } from './types.js'

const DEFAULT_MODEL = 'whisper-large-v3-turbo'

type GroqWhisperConfig = {
	apiKey: string
	model?: string
}

export class GroqWhisperSTT implements STTProvider {
	readonly name = 'groqWhisper'
	private readonly client: Groq
	private readonly model: string

	constructor(config: GroqWhisperConfig) {
		this.client = new Groq({ apiKey: config.apiKey })
		this.model = config.model ?? DEFAULT_MODEL
	}

	async transcribe(audio: Audio, opts?: AbortOptions): Promise<string> {
		const filename = `audio.${audio.format.encoding === 'pcm16' ? 'wav' : audio.format.encoding}`
		const file = await toFile(audio.data, filename)

		const result = await this.client.audio.transcriptions.create(
			{ file, model: this.model, response_format: 'text' },
			{ signal: opts?.signal },
		)
		return typeof result === 'string' ? result : result.text
	}
}
