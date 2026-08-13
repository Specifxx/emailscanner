import { getSession } from '../lib/session.js'
import { getUser, listAccounts } from '../lib/supabase.js'
import { configuredProviders } from '../lib/config.js'
import { getProvider } from '../lib/providers/index.js'
import { getPlan, periodStart } from '../lib/plans.js'
import { billingEnabled } from '../lib/billing.js'

export default async function handler(req, res) {
  const providers = configuredProviders().map((id) => ({
    id,
    label: getProvider(id).label,
  }))
  const billing = billingEnabled()

  const session = getSession(req)
  if (!session) {
    return res
      .status(200)
      .json({ user: null, accounts: [], providers, billing })
  }

  try {
    const [accounts, user] = await Promise.all([
      listAccounts(session.uid),
      getUser(session.uid),
    ])

    if (!user) {
      return res
        .status(200)
        .json({ user: null, accounts: [], providers, billing })
    }

    const plan = getPlan(user.plan)
    // A counter from a previous window has already lapsed, so report 0 rather
    // than a stale number the next scan would reset anyway.
    const current =
      user.scan_period_start &&
      new Date(user.scan_period_start).getTime() === periodStart(plan).getTime()
    const used = current ? user.scans_used : 0

    res.status(200).json({
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
      billing,
      plan: {
        id: plan.id,
        name: plan.name,
        period: plan.period,
        limit: plan.scans,
        used,
        mailboxLimit: plan.mailboxes === Infinity ? null : plan.mailboxes,
        renewsAt: user.plan_renews_at,
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
    // Still hand back the provider list — without it the sign-in screen would
    // render with no way to sign in.
    res.status(500).json({ error: err.message, providers, billing })
  }
}
