import { useState } from 'react'

export const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceAnnual: 0,
    blurb: 'Enough to find what you lost.',
    features: [
      '5 scans per day',
      'Up to 2 mailboxes',
      '__MAIL__',
      'Read and unread mail',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 12,
    priceAnnual: 10,
    featured: true,
    blurb: 'For inboxes you actually live in.',
    features: [
      'Unlimited scans',
      'Unlimited mailboxes',
      '__MAIL__',
      'Priority support',
    ],
  },
]

export default function Pricing({
  currentPlan,
  billing,
  testMode,
  onUpgrade,
  busy,
  mailCopy = 'Gmail',
  signInPrompt = null,
}) {
  const [annual, setAnnual] = useState(false)

  return (
    <section className="pricing" id="pricing">
      <h2>Simple pricing</h2>
      <p className="pricing-lead">Start free. Upgrade only if you outgrow it.</p>

      {testMode ? (
        <div className="test-mode-banner">
          <strong>Stripe sandbox</strong> Checkout is running on test keys, so
          real cards will be declined. Use <code>4242 4242 4242 4242</code> with
          any future expiry and CVC.
        </div>
      ) : null}

      <div className="toggle" role="group" aria-label="Billing period">
        <button
          className={annual ? 'toggle-opt' : 'toggle-opt on'}
          onClick={() => setAnnual(false)}
        >
          Monthly
        </button>
        <button
          className={annual ? 'toggle-opt on' : 'toggle-opt'}
          onClick={() => setAnnual(true)}
        >
          Annual <span className="save">save 17%</span>
        </button>
      </div>

      <div className="tiers">
        {TIERS.map((tier) => {
          const price = annual ? tier.priceAnnual : tier.price
          const isCurrent = currentPlan === tier.id
          return (
            <div
              className={tier.featured ? 'tier featured' : 'tier'}
              key={tier.id}
            >
              <div className="tier-name">{tier.name}</div>
              <div className="tier-price">
                {price === 0 ? (
                  <strong>Free</strong>
                ) : (
                  <>
                    <strong>${price}</strong>
                    <span>/month</span>
                  </>
                )}
              </div>
              <p className="tier-blurb">
                {price > 0 && annual ? 'billed yearly. ' : ''}
                {tier.blurb}
              </p>

              <ul className="tier-features">
                {tier.features.map((feature) => (
                  <li key={feature}>
                    {feature === '__MAIL__' ? mailCopy : feature}
                  </li>
                ))}
              </ul>

              {tier.id === 'free' ? (
                <div className="tier-note">
                  {isCurrent ? 'Your current plan' : 'No card required'}
                </div>
              ) : isCurrent ? (
                <div className="tier-note">Your current plan</div>
              ) : (
                <button
                  className="tier-btn"
                  disabled={busy || !billing}
                  onClick={() => onUpgrade(annual ? 'year' : 'month')}
                >
                  {billing ? 'Upgrade to Pro' : 'Coming soon'}
                </button>
              )}
            </div>
          )
        })}

        <div className="tier ghost">
          <div className="tier-name">Need more?</div>
          <p className="tier-blurb">
            Higher volume, more mailboxes, or something bespoke.
          </p>
          <a className="tier-btn ghost-btn" href="mailto:hello@emailscanner.app">
            Get in touch
          </a>
        </div>
      </div>

      {signInPrompt}
    </section>
  )
}
