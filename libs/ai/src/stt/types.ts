import type { AbortOptions, Audio } from '../types.js'

export interface STTProvider {
	readonly name: string
	transcribe(audio: Audio, opts?: AbortOptions): Promise<string>
}
