import Stripe from 'stripe'
import { config } from './config.js'

let client = null

/** Billing is optional — without keys the app runs as free-tier only. */
export function billingEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_MONTHLY)
}

export function stripe() {
  if (!billingEnabled()) {
    throw new Error('Billing is not configured.')
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return client
}

export function priceId(interval) {
  return interval === 'year'
    ? process.env.STRIPE_PRICE_ANNUAL || process.env.STRIPE_PRICE_MONTHLY
    : process.env.STRIPE_PRICE_MONTHLY
}

export function returnUrl(path = '/') {
  return `${config.appUrl}${path}`
}
