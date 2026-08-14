import * as api from '../api.js'
import ProviderMark from './ProviderMark.jsx'
import Pricing from './Pricing.jsx'
import TrustIcon from './TrustIcon.jsx'
import ScanCount from './ScanCount.jsx'

/**
 * Copy follows whichever providers are actually configured, so turning Outlook
 * on or off never leaves the page promising something it can't do.
 */
function providerCopy(providers) {
  const ids = providers.map((p) => p.id)
  const outlook = ids.includes('microsoft')
  return {
    // "Gmail" / "Gmail and Outlook"
    mail: outlook ? 'Gmail and Outlook' : 'Gmail',
    // "Google" / "Google or Microsoft"
    account: outlook ? 'Google or Microsoft' : 'Google',
    scopes: outlook ? (
      <>
        <code>gmail.readonly</code> on Google, <code>Mail.Read</code> on
        Microsoft. Both are read-only.
      </>
    ) : (
      <>
        <code>gmail.readonly</code> — read-only.
      </>
    ),
  }
}

/**
 * Each promise is one the code actually keeps, and names the mechanism rather
 * than asserting trustworthiness — "we never request bodies" is checkable,
 * "we respect your privacy" is not.
 */
function promises(copy) {
  return [
    {
      icon: 'eye',
      title: 'Read-only, always',
      body: `We ask ${copy.account} for read-only access. The app has no permission to send, delete, or change anything — not even if it wanted to.`,
    },
    {
      icon: 'envelope',
      title: 'Your emails are never opened',
      body: 'Scans read subject lines, senders, dates, and the preview line your inbox already shows. Message bodies are never requested, so we never receive them.',
    },
    {
      icon: 'noRobot',
      title: 'No AI, no training',
      body: 'Matching is a keyword dictionary and a scoring function. Nothing is sent to a language model, and nothing is used to train anything.',
    },
    {
      icon: 'database',
      title: 'Nothing is stored',
      body: 'Results are assembled per search and sent straight to your browser. No mail is written to our database — only your email address and an encrypted access token.',
    },
    {
      icon: 'lock',
      title: 'Tokens encrypted at rest',
      body: 'Access tokens are encrypted with AES-256-GCM before they touch the database, so a stolen database dump still opens no mailboxes.',
    },
    {
      icon: 'unplug',
      title: 'Revoke in one click',
      body: `Disconnect a mailbox here, or cut access from your ${copy.account} account settings. Either way access ends immediately.`,
    },
  ]
}

function steps(copy) {
  return [
    {
      n: 1,
      title: 'Connect a mailbox',
      body: `Sign in with ${copy.account}. Add as many as you like.`,
    },
    {
      n: 2,
      title: 'Say what you want',
      body: '“Job offers I might have missed.” Plain English, no search syntax.',
    },
    {
      n: 3,
      title: 'Get it ranked',
      body: 'Every mailbox at once, best matches first, read and unread.',
    },
  ]
}

export default function SignIn({ providers, billing, testMode, notice }) {
  const copy = providerCopy(providers)
  const PROMISES = promises(copy)
  const STEPS = steps(copy)

  const buttons = (
    <div className="signin-buttons">
      {providers.map((provider) => (
        <button
          key={provider.id}
          className="provider-btn"
          onClick={() => api.connect(provider.id)}
        >
          <ProviderMark provider={provider.id} />
          Continue with {provider.label}
        </button>
      ))}
      {!providers.length ? (
        <p className="signin-note">Sign-in is temporarily unavailable.</p>
      ) : null}
    </div>
  )

  return (
    <div className="landing">
      <header className="landing-nav">
        <button
          className="brand brand-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          <span aria-hidden="true">🔍</span>
          Email Scanner
        </button>
        <a className="nav-link" href="#pricing">
          Pricing
        </a>
      </header>

      {notice ? <div className="error landing-error">{notice}</div> : null}

      <section className="hero">
        <h1>Find what your inbox buried.</h1>
        <p className="hero-lead">
          Search {copy.mail} the way you'd say it out loud. One search, every
          mailbox, ranked by how well it actually matches.
        </p>

        {buttons}

        <p className="hero-note">
          Read-only access · Your emails are never opened · Free to start
        </p>

        <ScanCount />
      </section>

      <section className="steps">
        {STEPS.map((step) => (
          <div className="step" key={step.n}>
            <div className="step-n">{step.n}</div>
            <div>
              <div className="step-title">{step.title}</div>
              <p>{step.body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="trust">
        <h2>What this app can and cannot do</h2>
        <p className="trust-lead">
          Connecting a mailbox to anything should make you cautious. Here is
          exactly what happens, and what is not possible by design.
        </p>

        <div className="promises">
          {PROMISES.map((promise) => (
            <div className="promise" key={promise.title}>
              <div className="promise-icon">
                <TrustIcon name={promise.icon} />
              </div>
              <div className="promise-title">{promise.title}</div>
              <p>{promise.body}</p>
            </div>
          ))}
        </div>

        <div className="scope-note">
          <strong>The permission you'll be asked for</strong>
          {copy.scopes} No sending, deleting, or modifying mail, and no access
          to contacts, files, or calendars.
        </div>
      </section>

      <Pricing
        currentPlan={null}
        billing={billing}
        testMode={testMode}
        onUpgrade={() => {}}
        mailCopy={copy.mail}
      />

      <section className="closer">
        <h2>Ready when you are.</h2>
        {buttons}
      </section>

      <footer className="landing-foot">
        <div>Email Scanner · Read-only access · Nothing sent to an AI</div>
        <div className="foot-links">
          <a href="/privacy.html">Privacy</a>
          <a href="/terms.html">Terms</a>
        </div>
      </footer>
    </div>
  )
}
