import { useCallback, useEffect, useState } from 'react'
import * as api from './api.js'
import SignIn from './components/SignIn.jsx'
import Header from './components/Header.jsx'
import SearchBar from './components/SearchBar.jsx'
import Mailboxes from './components/Mailboxes.jsx'
import Results from './components/Results.jsx'

const OAUTH_ERRORS = {
  declined: 'Sign-in was cancelled.',
  bad_state: 'That sign-in link expired. Please try again.',
  missing_code: 'Sign-in did not complete. Please try again.',
  auth_failed: 'Could not finish sign-in. Please try again.',
  already_linked: 'That mailbox is already connected to another account.',
  unknown_provider: 'That sign-in method is not available.',
  mailbox_limit: 'Your plan is at its mailbox limit. Upgrade to add more.',
}

function readOAuthError() {
  const code = new URLSearchParams(window.location.search).get('error')
  if (!code) return null
  return OAUTH_ERRORS[code] || 'Something went wrong signing in.'
}

export default function App() {
  const [me, setMe] = useState({ user: null, accounts: [], providers: [] })
  const [booting, setBooting] = useState(true)
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ status: 'idle' })
  const [notice, setNotice] = useState(null)

  const refresh = useCallback(
    () =>
      api
        .getMe()
        .then(setMe)
        .catch((err) => {
          // Keep the provider list if the server sent one, so the sign-in
          // screen never renders without a way to sign in.
          setMe((current) => ({
            user: null,
            accounts: [],
            providers: err.body?.providers || current.providers,
          }))
          setNotice("Couldn't reach the server. Please try again.")
        }),
    []
  )

  useEffect(() => {
    refresh().finally(() => setBooting(false))
  }, [refresh])

  // Reading the OAuth error is a side effect (it rewrites the URL), so it
  // belongs here rather than in a useState initialiser, which StrictMode
  // invokes twice and would leave the banner permanently swallowed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const message = readOAuthError()
    const upgraded = params.get('upgraded')
    if (!message && !upgraded) return
    setNotice(message || "You're on Pro. 800 scans a month, unlimited mailboxes.")
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const upgrade = useCallback(async (interval) => {
    setNotice(null)
    try {
      await api.upgrade(interval)
    } catch (err) {
      setNotice(err.message)
    }
  }, [])

  const runSearch = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setState({ status: 'loading' })
    setNotice(null)
    try {
      const data = await api.scan(trimmed)
      setState({
        status: 'done',
        emails: data.emails || [],
        scanned: data.scanned || 0,
        mailboxes: data.mailboxes || 0,
        failures: data.failures || [],
        usage: data.usage,
      })
    } catch (err) {
      setState({
        status: 'error',
        error: err.message,
        // 402 means the allowance ran out, which is an upsell rather than a
        // failure the user can retry their way out of.
        outOfScans: err.status === 402,
        canUpgrade: Boolean(err.body?.upgrade),
      })
    }
  }, [])

  async function signOut() {
    try {
      await api.logout()
    } finally {
      setMe((current) => ({ user: null, accounts: [], providers: current.providers }))
      setQuery('')
      setState({ status: 'idle' })
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      'Delete your account?\n\nEvery connected mailbox and its stored tokens are removed permanently. Your email itself is untouched.'
    )
    if (!confirmed) return

    setNotice(null)
    try {
      await api.deleteMyAccount()
      setMe((current) => ({
        user: null,
        accounts: [],
        providers: current.providers,
        billing: current.billing,
      }))
      setQuery('')
      setState({ status: 'idle' })
    } catch (err) {
      setNotice(err.message)
    }
  }

  async function disconnect(account) {
    if (!window.confirm(`Disconnect ${account.email}?`)) return
    setNotice(null)
    try {
      await api.disconnect(account.id)
      // Last mailbox gone means there is nothing left to search.
      if (me.accounts.length <= 1) {
        await signOut()
        return
      }
      await refresh()
      setState({ status: 'idle' })
    } catch (err) {
      setNotice(err.message)
    }
  }

  // Nothing renders until we know who the user is — avoids a sign-in flash.
  if (booting) return null

  if (!me.user) {
    return (
      <SignIn
        providers={me.providers}
        billing={me.billing}
        notice={notice}
      />
    )
  }

  const needsReconnect =
    state.status === 'done'
      ? state.failures.filter((f) => f.needsReconnect).map((f) => f.accountId)
      : []

  // The scan response carries fresher usage than the last /api/me did.
  const plan = me.plan
    ? { ...me.plan, ...(state.usage ? { used: state.usage.used } : {}) }
    : null

  return (
    <div className="shell">
      <Header
        user={me.user}
        plan={plan}
        billing={me.billing}
        onSignOut={signOut}
        onUpgrade={() => upgrade('month')}
        onManage={() => api.manageBilling().catch((e) => setNotice(e.message))}
      />
      <Mailboxes
        accounts={me.accounts}
        providers={me.providers}
        onDisconnect={disconnect}
        needsReconnect={needsReconnect}
      />
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        onSearch={runSearch}
        busy={state.status === 'loading'}
      />
      {notice ? <div className="error">{notice}</div> : null}
      <Results
        state={state}
        multiple={me.accounts.length > 1}
        billing={me.billing}
        onUpgrade={() => upgrade('month')}
      />

      <footer className="app-foot">
        <a href="/privacy.html">Privacy</a>
        <a href="/terms.html">Terms</a>
        <button className="danger-link" onClick={deleteAccount}>
          Delete account
        </button>
      </footer>
    </div>
  )
}
