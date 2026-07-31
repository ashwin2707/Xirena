import { z } from 'zod'

const schema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	PORT: z.coerce.number().default(3000),
	DATABASE_URL: z.string().min(1),

	JWT_SECRET: z.string().min(32),
	ACCESS_TOKEN_TTL: z
		.string()
		.regex(/^\d+(ms|s|m|h|d)$/)
		.default('15m'),
	REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

	WEB_ORIGIN: z
		.url()
		.refine((url) => !url.endsWith('/'))
		.default('http://localhost:5173'),

	GROQ_API_KEY: z.string().min(1),
	GROQ_LLM_MODEL: z.string().optional(),
	GROQ_STT_MODEL: z.string().optional(),
	ELEVEN_LABS_API_KEY: z.string().min(1),
	ELEVEN_LABS_MODEL: z.string().optional(),
	ELEVEN_LABS_VOICE: z.string().optional(),
	ELEVEN_LABS_OUTPUT_FORMAT: z.string().optional(),

	DISCORD_CLIENT_ID: z.string().optional(),
	DISCORD_CLIENT_SECRET: z.string().optional(),
	DISCORD_CALLBACK_URL: z.url().optional(),
})

export const env = schema.parse(process.env)
