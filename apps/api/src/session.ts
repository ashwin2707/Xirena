import type { User } from '@xirena/db'
import type { FastifyReply, FastifyRequest } from 'fastify'

const REFRESH_COOKIE = 'refresh_token'

export const setRefreshCookie = (reply: FastifyReply, raw: string, expiresAt: Date): void => {
	reply.setCookie(REFRESH_COOKIE, raw, {
		httpOnly: true,
		secure: true,
		sameSite: 'none',
		path: '/auth',
		expires: expiresAt,
	})
}

export const clearRefreshCookie = (reply: FastifyReply): void => {
	reply.clearCookie(REFRESH_COOKIE, { secure: true, sameSite: 'none', path: '/auth' })
}

export const readRefreshCookie = (request: FastifyRequest): string | undefined => request.cookies[REFRESH_COOKIE]

export const publicUser = (user: User) => ({
	id: user.id,
	email: user.email,
	displayName: user.displayName,
})
