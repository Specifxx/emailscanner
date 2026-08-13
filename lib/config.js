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

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
]
