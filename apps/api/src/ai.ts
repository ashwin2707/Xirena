import { createAI } from '@xirena/ai'
import { env } from './env.js'

export const ai = createAI({
	groqApiKey: env.GROQ_API_KEY,
	groqLlmModel: env.GROQ_LLM_MODEL,
	groqSttModel: env.GROQ_STT_MODEL,
	elevenLabsApiKey: env.ELEVEN_LABS_API_KEY,
	elevenLabsModel: env.ELEVEN_LABS_MODEL,
	elevenLabsVoice: env.ELEVEN_LABS_VOICE,
	elevenLabsOutputFormat: env.ELEVEN_LABS_OUTPUT_FORMAT,
})
