import { getSession } from '../lib/session.js'
import { getUser, listAccounts } from '../lib/supabase.js'
import { configuredProviders } from '../lib/config.js'
import { getProvider } from '../lib/providers/index.js'
import { getPlan, isUnlimited, periodStart } from '../lib/plans.js'
import { billingEnabled, isTestMode } from '../lib/billing.js'

export default async function handler(req, res) {
  const providers = configuredProviders().map((id) => ({
    id,
    label: getProvider(id).label,
  }))
  const billing = billingEnabled()
  // Surfaced so the pricing UI can say so out loud — a sandbox key declines
  // every real card, and there is no other clue until checkout fails.
  const billingTestMode = billing && isTestMode()

  const session = getSession(req)
  if (!session) {
    return res
      .status(200)
      .json({ user: null, accounts: [], providers, billing, billingTestMode })
  }

  try {
    const [accounts, user] = await Promise.all([
      listAccounts(session.uid),
      getUser(session.uid),
    ])

    if (!user) {
      return res
        .status(200)
        .json({ user: null, accounts: [], providers, billing, billingTestMode })
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
      billingTestMode,
      plan: {
        id: plan.id,
        name: plan.name,
        period: plan.period,
        // null means uncapped; the UI keys off that rather than a sentinel
        // number, since Infinity does not survive JSON.
        limit: isUnlimited(plan) ? null : plan.scans,
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
    res.status(500).json({ error: err.message, providers, billing, billingTestMode })
  }
}
