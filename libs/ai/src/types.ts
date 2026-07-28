export type Role = 'system' | 'user' | 'assistant'

export type Message = {
	role: Role
	content: string
}

export type AbortOptions = {
	signal?: AbortSignal
}

type AudioEncoding = 'wav' | 'pcm16' | 'mp3' | 'webm' | 'ogg' | 'm4a'

type AudioFormat = {
	encoding: AudioEncoding
	sampleRate?: number
}

export type Audio = {
	data: Uint8Array
	format: AudioFormat
}
