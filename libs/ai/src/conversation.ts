import type { LLMProvider } from './llm/types.js'
import type { AbortOptions, Message } from './types.js'

export type TurnContext = {
	history: Message[]
	memories: string[]
}

type AssistantOptions = {
	system?: string
}

const MEMORY_EXTRACTION_PROMPT = [
	'You extract durable, long-term facts about the user from a conversation.',
	'Extract only stable information such as:',
	'- Long-term preferences',
	'- Personal details',
	'- Goals',
	'- Ongoing relationships',
	'',
	'Ignore one-off or transient information.',
	'Respond with ONLY a JSON array of short fact strings.',
	'Example: ["prefers dark mode","has a dog named Mochi"].',
	'Return [] if there is nothing worth remembering.',
].join('\n')

export class Assistant {
	private readonly llm: LLMProvider
	private readonly system: string | undefined

	constructor(llm: LLMProvider, opts: AssistantOptions = {}) {
		this.llm = llm
		this.system = opts.system
	}

	/** Stream a reply. Context must already be resolved by the caller. */
	send(userText: string, context: TurnContext, opts?: AbortOptions): AsyncIterable<string> {
		return this.llm.chat(this.buildMessages(userText, context), opts)
	}

	/** Pull durable facts out of a finished turn. The caller decides what to persist. */
	async extractFacts(
		userText: string,
		assistantText: string,
		known: string[],
		opts?: AbortOptions,
	): Promise<string[]> {
		const messages: Message[] = [
			{ role: 'system', content: MEMORY_EXTRACTION_PROMPT },
			{
				role: 'user',
				content: [
					'Already known (do NOT repeat):',
					known.join('\n') || '(none)',
					'',
					'Conversation:',
					`User: ${userText}`,
					`Assistant: ${assistantText}`,
				].join('\n'),
			},
		]
		let raw = ''
		for await (const chunk of this.llm.chat(messages, opts)) {
			raw += chunk
		}
		return parseFacts(raw)
	}

	private buildMessages(userText: string, context: TurnContext): Message[] {
		const messages: Message[] = []
		const system = this.systemWithMemories(context.memories)
		if (system) messages.push({ role: 'system', content: system })
		messages.push(...context.history, { role: 'user', content: userText })
		return messages
	}

	private systemWithMemories(memories: string[]): string | undefined {
		if (memories.length === 0) return this.system
		const block = `What you know about the user:\n${memories.map((item) => `- ${item}`).join('\n')}`
		return [this.system, block].filter(Boolean).join('\n\n')
	}
}

const parseFacts = (raw: string): string[] => {
	const match = raw.match(/\[[\s\S]*\]/) // grab the first JSON array in the output
	if (!match) return []
	try {
		const parsed: unknown = JSON.parse(match[0])
		if (!Array.isArray(parsed)) return []
		return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
	} catch {
		return []
	}
}
