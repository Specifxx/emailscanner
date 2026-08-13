function formatDate(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function scoreClass(score) {
  if (score >= 70) return 'score'
  if (score >= 40) return 'score mid'
  return 'score low'
}

function Skeleton() {
  return (
    <div className="list skeleton">
      {[0, 1, 2, 3, 4].map((i) => (
        <div className="row" key={i}>
          <div className="dot read" />
          <div className="row-main">
            <div className="bar" style={{ width: `${70 - i * 6}%` }} />
            <div className="bar" style={{ width: '34%', marginTop: 9, height: 8 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Results({ state, multiple }) {
  if (state.status === 'idle') {
    return (
      <div className="results">
        <p className="hint">Type what you're after, or tap an example above.</p>
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="results">
        <div className="results-meta">
          <span>Scanning your inbox…</span>
        </div>
        <Skeleton />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="results">
        <div className="error">
          <span aria-hidden="true">⚠</span>
          {state.error}
        </div>
      </div>
    )
  }

  const { emails, scanned, mailboxes, failures } = state

  const skipped = failures?.length ? (
    <div className="error">
      <span aria-hidden="true">⚠</span>
      Couldn't search {failures.map((f) => f.email).join(', ')}
      {failures.some((f) => f.needsReconnect) ? ' — reconnect it below.' : '.'}
    </div>
  ) : null

  if (!emails.length) {
    return (
      <div className="results">
        {skipped}
        <div className="list">
          <div className="empty">
            <strong>No matches found</strong>
            Try different words — like “offer letter” or “interview”.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="results">
      {skipped}
      <div className="results-meta">
        <span>
          {emails.length} {emails.length === 1 ? 'match' : 'matches'}
        </span>
        {scanned ? (
          <span>
            {scanned} scanned
            {mailboxes > 1 ? ` across ${mailboxes} mailboxes` : ''}
          </span>
        ) : null}
      </div>

      <div className="list">
        {emails.map((email) => (
          <a
            className="row"
            key={`${email.accountEmail}:${email.id}`}
            href={email.url}
            target="_blank"
            rel="noreferrer"
          >
            <div className={email.unread ? 'dot' : 'dot read'} />
            <div className="row-main">
              <div className="row-top">
                <div className={email.unread ? 'subject unread' : 'subject'}>
                  {email.subject || '(no subject)'}
                </div>
                <div className="date">{formatDate(email.date)}</div>
              </div>
              <div className="sender">
                {email.from}
                {multiple ? <span className="via">{email.accountEmail}</span> : null}
              </div>
              {email.snippet ? <div className="snippet">{email.snippet}</div> : null}
            </div>
            <div className={scoreClass(email.score)}>{email.score}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
