export class EmailTakenError extends Error {
	constructor(email: string) {
		super(`Email already in use: ${email}`)
		this.name = 'EmailTakenError'
	}
}

export class InvalidCredentialsError extends Error {
	constructor() {
		super('Invalid email or password')
		this.name = 'InvalidCredentialsError'
	}
}

export class InvalidRefreshTokenError extends Error {
	constructor() {
		super('Invalid or expired refresh token')
		this.name = 'InvalidRefreshTokenError'
	}
}
