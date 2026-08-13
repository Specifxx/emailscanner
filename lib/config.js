function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example for setup.`
    )
  }
  return value
}

export const config = {
  get googleClientId() {
    return required('GOOGLE_CLIENT_ID')
  },
  get googleClientSecret() {
    return required('GOOGLE_CLIENT_SECRET')
  },
  get googleRedirectUri() {
    return required('GOOGLE_REDIRECT_URI')
  },
  get microsoftClientId() {
    return required('MICROSOFT_CLIENT_ID')
  },
  get microsoftClientSecret() {
    return required('MICROSOFT_CLIENT_SECRET')
  },
  // Both providers redirect to the same callback, so this defaults to it.
  get microsoftRedirectUri() {
    return process.env.MICROSOFT_REDIRECT_URI || `${this.appUrl}/api/auth/callback`
  },
  get supabaseUrl() {
    return required('SUPABASE_URL')
  },
  get supabaseServiceKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY')
  },
  get sessionSecret() {
    return required('SESSION_SECRET')
  },
  get appUrl() {
    return process.env.APP_URL || 'http://localhost:3000'
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
  },
}

/** Which providers have credentials configured, so the UI can hide the rest. */
export function configuredProviders() {
  const ids = []
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    ids.push('google')
  }
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    ids.push('microsoft')
  }
  return ids
}
