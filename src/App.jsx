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
}

function readOAuthError() {
  const code = new URLSearchParams(window.location.search).get('error')
  if (!code) return null
  // Drop the query string so a refresh doesn't resurrect the banner.
  window.history.replaceState({}, '', window.location.pathname)
  return OAUTH_ERRORS[code] || 'Something went wrong signing in.'
}

export default function App() {
  const [me, setMe] = useState({ user: null, accounts: [], providers: [] })
  const [booting, setBooting] = useState(true)
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ status: 'idle' })
  const [notice, setNotice] = useState(readOAuthError)

  const refresh = useCallback(
    () =>
      api
        .getMe()
        .then(setMe)
        .catch(() => setMe({ user: null, accounts: [], providers: [] })),
    []
  )

  useEffect(() => {
    refresh().finally(() => setBooting(false))
  }, [refresh])

  const runSearch = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setState({ status: 'loading' })
    try {
      const data = await api.scan(trimmed)
      setState({
        status: 'done',
        emails: data.emails || [],
        scanned: data.scanned || 0,
        mailboxes: data.mailboxes || 0,
        failures: data.failures || [],
      })
    } catch (err) {
      setState({ status: 'error', error: err.message })
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

  async function disconnect(account) {
    if (!window.confirm(`Disconnect ${account.email}?`)) return
    try {
      await api.disconnect(account.id)
      // Last mailbox gone means there is nothing left to search.
      if (me.accounts.length <= 1) return signOut()
      await refresh()
      setState({ status: 'idle' })
    } catch (err) {
      setNotice(err.message)
    }
  }

  // Nothing renders until we know who the user is — avoids a sign-in flash.
  if (booting) return null

  if (!me.user) return <SignIn providers={me.providers} />

  const needsReconnect =
    state.status === 'done'
      ? state.failures.filter((f) => f.needsReconnect).map((f) => f.email)
      : []

  return (
    <div className="shell">
      <Header user={me.user} onSignOut={signOut} />
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
      <Results state={state} multiple={me.accounts.length > 1} />
    </div>
  )
}
