/** Signals the user must re-authenticate. Surfaces as a 401 to the client. */
export class AuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthError'
  }
}
