import { db } from './db.js'
import { env } from './env.js'
import { buildServer } from './server.js'

const app = buildServer()
const SHUTDOWN_GRACE_MS = 15_000

let shuttingDown = false
const shutdown = async (signal: string): Promise<void> => {
	if (shuttingDown) return
	shuttingDown = true
	app.log.info(`${signal} received, shutting down`)

	const forced = setTimeout(() => {
		app.log.error('graceful shutdown timed out, forcing exit')
		process.exit(1)
	}, SHUTDOWN_GRACE_MS)
	forced.unref()

	try {
		await app.close()
		await db.disconnect()
	} catch (err) {
		app.log.error({ err }, 'error during shutdown')
		process.exitCode = 1
	} finally {
		clearTimeout(forced)
	}
}

const onSignal = (signal: string) => {
	shutdown(signal).catch((err) => {
		app.log.error({ err }, 'shutdown failed')
		process.exit(1)
	})
}
process.on('SIGTERM', () => onSignal('SIGTERM'))
process.on('SIGINT', () => onSignal('SIGINT'))

process.on('unhandledRejection', (reason) => {
	app.log.error({ err: reason }, 'unhandled rejection')
})
process.on('uncaughtException', (err) => {
	app.log.fatal({ err }, 'uncaught exception')
	process.exit(1)
})

try {
	const address = await app.listen({ port: env.PORT, host: '0.0.0.0' })
	app.log.info(`API listening on ${address}`)
} catch (err) {
	app.log.error(err)
	process.exit(1)
}
