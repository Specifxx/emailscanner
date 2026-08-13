import { getSession } from '../lib/session.js'
import { consumeScan, getUser, listAccounts } from '../lib/supabase.js'
import { AuthError } from '../lib/errors.js'
import { getAccessToken, getProvider } from '../lib/providers/index.js'
import { parseQuery, rankEmails } from '../lib/scorer.js'
import { readJsonBody } from '../lib/http.js'
import {
  effectiveLimit,
  getPlan,
  isUnlimited,
  periodStart,
} from '../lib/plans.js'

const MAX_PER_ACCOUNT = 100

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ error: 'Please sign in again.' })
  }

  let query
  try {
    ;({ query } = await readJsonBody(req))
  } catch {
    return res.status(400).json({ error: 'Could not read your request.' })
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Type what you are looking for.' })
  }

  try {
    const accounts = await listAccounts(session.uid)
    if (!accounts.length) {
      return res.status(400).json({ error: 'Connect a mailbox first.' })
    }

    const user = await getUser(session.uid)
    if (!user) {
      return res.status(401).json({ error: 'Please sign in again.' })
    }

    // Claimed before any mail API calls, so a user over their limit costs us
    // nothing. Uncapped plans go through the same call with an effectively
    // infinite limit, which keeps the lifetime counter accurate for everyone.
    const plan = getPlan(user.plan)
    const quota = await consumeScan(
      session.uid,
      effectiveLimit(plan),
      periodStart(plan)
    )

    if (!quota.allowed) {
      return res.status(402).json({
        error: `That's all ${plan.scans} scans for today. They reset at midnight UTC — or go Pro for unlimited.`,
        upgrade: plan.id === 'free',
        usage: { used: quota.used, limit: plan.scans, period: plan.period },
      })
    }

    const parsed = parseQuery(query)

    // Every mailbox is searched at once. One failing mailbox degrades to a
    // warning instead of sinking the whole scan.
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const accessToken = await getAccessToken(account)
          const messages = await getProvider(account.provider).search(
            accessToken,
            parsed,
            { limit: MAX_PER_ACCOUNT, accountEmail: account.email }
          )
          return {
            messages: messages.map((message) => ({
              ...message,
              accountId: account.id,
              accountEmail: account.email,
              provider: account.provider,
            })),
          }
        } catch (err) {
          console.error(`Scan failed for ${account.email}:`, err)
          return {
            messages: [],
            failure: {
              // Keyed by id, not email: two mailboxes can share an address
              // across providers, and matching on email flags the healthy one.
              accountId: account.id,
              email: account.email,
              needsReconnect: err instanceof AuthError,
              message: err.message,
            },
          }
        }
      })
    )

    const messages = results.flatMap((result) => result.messages)
    const failures = results.map((r) => r.failure).filter(Boolean)

    // Every mailbox failed, so this is an error rather than an empty result.
    if (!messages.length && failures.length === accounts.length) {
      const needsReconnect = failures.some((f) => f.needsReconnect)
      return res.status(needsReconnect ? 401 : 502).json({
        error: failures[0].message,
      })
    }

    res.status(200).json({
      emails: rankEmails(messages, parsed),
      scanned: messages.length,
      mailboxes: accounts.length,
      categories: parsed.categories,
      failures: failures.map((f) => ({
        accountId: f.accountId,
        email: f.email,
        needsReconnect: f.needsReconnect,
      })),
      usage: {
        used: quota.used,
        limit: isUnlimited(plan) ? null : plan.scans,
        period: plan.period,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(401).json({ error: err.message })
    }
    console.error('Scan failed:', err)
    res.status(500).json({ error: err.message || 'Scan failed. Try again.' })
  }
}
