import { useCallback, useEffect, useState } from 'react'
import * as api from './api.js'
import SignIn from './components/SignIn.jsx'
import Header from './components/Header.jsx'
import SearchBar from './components/SearchBar.jsx'
import Results from './components/Results.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ status: 'idle' })

  useEffect(() => {
    let cancelled = false
    api
      .getMe()
      .then((data) => {
        if (!cancelled) setUser(data.user)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
      })
    } catch (err) {
      setState({ status: 'error', error: err.message })
    }
  }, [])

  async function signOut() {
    try {
      await api.logout()
    } finally {
      setUser(null)
      setQuery('')
      setState({ status: 'idle' })
    }
  }

  // Nothing renders until we know who the user is — avoids a sign-in flash.
  if (booting) return null

  if (!user) return <SignIn />

  return (
    <div className="shell">
      <Header user={user} onSignOut={signOut} />
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        onSearch={runSearch}
        busy={state.status === 'loading'}
      />
      <Results state={state} />
    </div>
  )
}
