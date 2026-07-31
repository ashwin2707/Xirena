import type { AbortOptions, Audio } from '../types.js'

export interface TTSProvider {
	readonly name: string
	synthesizeStreamingInput(textStream: AsyncIterable<string>, opts?: AbortOptions): AsyncIterable<Audio>
}
