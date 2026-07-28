import Groq from 'groq-sdk'
import type { AbortOptions, Message } from '../types.js'
import type { LLMProvider } from './types.js'

const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

type GroqLLMConfig = {
	apiKey: string
	model?: string
}

export class GroqLLM implements LLMProvider {
	readonly name = 'groq'
	private readonly client: Groq
	private readonly model: string

	constructor(config: GroqLLMConfig) {
		this.client = new Groq({ apiKey: config.apiKey })
		this.model = config.model ?? DEFAULT_MODEL
	}

	async *chat(messages: Message[], opts?: AbortOptions): AsyncIterable<string> {
		const stream = await this.client.chat.completions.create(
			{ model: this.model, messages, stream: true },
			{ signal: opts?.signal },
		)
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta?.content
			if (delta) yield delta
		}
	}
}
