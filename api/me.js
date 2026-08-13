import { getSession } from '../lib/session.js'
import { listAccounts } from '../lib/supabase.js'
import { configuredProviders } from '../lib/config.js'
import { getProvider } from '../lib/providers/index.js'

export default async function handler(req, res) {
  const providers = configuredProviders().map((id) => ({
    id,
    label: getProvider(id).label,
  }))

  const session = getSession(req)
  if (!session) {
    return res.status(200).json({ user: null, accounts: [], providers })
  }

  try {
    const accounts = await listAccounts(session.uid)

    res.status(200).json({
      user: {
        email: session.email,
        name: session.name,
        picture: session.picture,
      },
      accounts: accounts.map((account) => ({
        id: account.id,
        provider: account.provider,
        label: getProvider(account.provider).label,
        email: account.email,
      })),
      providers,
    })
  } catch (err) {
    console.error('Could not load accounts:', err)
    res.status(500).json({ error: err.message })
  }
}
