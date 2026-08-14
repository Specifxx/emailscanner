/**
 * Free gets a small rolling daily allowance; Pro is uncapped. `Infinity` means
 * no limit, and callers must check for it rather than passing it downstream —
 * the quota counter in Postgres takes an integer.
 */
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    scans: 5,
    period: 'day',
    mailboxes: 2,
    blurb: 'Enough to find what you lost.',
    features: [
      '5 scans per day',
      'Up to 2 mailboxes',
      'Gmail and Outlook',
      'Read and unread mail',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 12,
    priceAnnual: 10,
    scans: Infinity,
    period: 'month',
    mailboxes: Infinity,
    blurb: 'For inboxes you actually live in.',
    features: [
      'Unlimited scans',
      'Unlimited mailboxes',
      'Gmail and Outlook',
      'Priority support',
    ],
  },
}

export function isUnlimited(plan) {
  return plan.scans === Infinity
}

/**
 * The landing page counts from here, so the number means "scans run" without
 * starting at an unconvincing zero.
 */
export const SCAN_COUNT_BASELINE = 10_000

/**
 * Postgres takes an integer, so an uncapped plan becomes the largest int4.
 * Keeping one code path means the lifetime counter is incremented for every
 * plan rather than only the metered ones.
 */
export const NO_LIMIT = 2_147_483_647

export function effectiveLimit(plan) {
  return isUnlimited(plan) ? NO_LIMIT : plan.scans
}

export const DEFAULT_PLAN = 'free'

export function getPlan(id) {
  return PLANS[id] || PLANS[DEFAULT_PLAN]
}

/**
 * Start of the window the current usage counter belongs to. Daily plans roll
 * at UTC midnight; monthly plans roll on the same day each month.
 */
export function periodStart(plan, now = new Date()) {
  const date = new Date(now)
  if (plan.period === 'day') {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    )
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}
