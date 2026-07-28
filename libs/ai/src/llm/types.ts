import type { AbortOptions, Message } from '../types.js'

export interface LLMProvider {
	readonly name: string
	chat(messages: Message[], opts?: AbortOptions): AsyncIterable<string>
}
