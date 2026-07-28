import { GroqLLM } from './llm/groq.js'
import type { LLMProvider } from './llm/types.js'
import { GroqWhisperSTT } from './stt/groq-whisper.js'
import type { STTProvider } from './stt/types.js'
import { ElevenLabsTTS } from './tts/eleven-labs.js'
import type { TTSProvider } from './tts/types.js'

export type AIConfig = {
	groqApiKey: string
	groqLlmModel?: string
	groqSttModel?: string
	elevenLabsApiKey: string
	elevenLabsModel?: string
	elevenLabsVoice?: string
	elevenLabsOutputFormat?: string
}

export type AI = {
	llm: LLMProvider
	stt: STTProvider
	tts: TTSProvider
}

export const createAI = (config: AIConfig): AI => ({
	llm: new GroqLLM({ apiKey: config.groqApiKey, model: config.groqLlmModel }),
	stt: new GroqWhisperSTT({ apiKey: config.groqApiKey, model: config.groqSttModel }),
	tts: new ElevenLabsTTS({
		apiKey: config.elevenLabsApiKey,
		model: config.elevenLabsModel,
		voice: config.elevenLabsVoice,
		outputFormat: config.elevenLabsOutputFormat,
	}),
})
