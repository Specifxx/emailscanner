import Stripe from 'stripe'
import { config } from './config.js'

let client = null

/** Billing is optional — without keys the app runs as free-tier only. */
export function billingEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_MONTHLY)
}

/**
 * Stripe encodes the mode in the key itself. Sandbox (what Stripe used to call
 * test mode) declines every real card, so knowing this is the difference
 * between "the code is broken" and "the keys are the wrong ones".
 */
export function isTestMode() {
  return String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')
}

export function stripe() {
  if (!billingEnabled()) {
    throw new Error('Billing is not configured.')
  }
  if (!client) {
    if (isTestMode() && config.isProduction) {
      console.warn(
        'STRIPE SANDBOX KEYS IN PRODUCTION — real cards will be declined. ' +
          'Swap STRIPE_SECRET_KEY, both price IDs and the webhook secret for ' +
          'their live-mode equivalents.'
      )
    }
    client = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return client
}

export function priceId(interval) {
  return interval === 'year'
    ? process.env.STRIPE_PRICE_ANNUAL || process.env.STRIPE_PRICE_MONTHLY
    : process.env.STRIPE_PRICE_MONTHLY
}

/**
 * Price IDs are mode-scoped but look identical, so a live key with sandbox
 * prices fails deep inside Stripe with a bare "No such price". Translate that
 * into the thing that is actually wrong.
 */
export function explainStripeError(err) {
  const message = err?.raw?.message || err?.message || ''

  if (/No such price/i.test(message)) {
    return isTestMode()
      ? 'Those price IDs do not exist in your Stripe sandbox. Sandbox and live mode have separate products — create the prices in the mode your key belongs to.'
      : 'Those price IDs do not exist in live mode. They were probably copied from your Stripe sandbox; recreate the product in live mode and use the new IDs.'
  }

  if (/Invalid API Key|No API key/i.test(message)) {
    return 'Stripe rejected the API key. Check STRIPE_SECRET_KEY.'
  }

  return null
}

export function returnUrl(path = '/') {
  return `${config.appUrl}${path}`
}
