const EXAMPLES = [
  'Job offers I might have missed',
  'Wedding invites',
  'Receipts from last month',
  'Flight confirmations',
]

export default function SearchBar({ query, onQueryChange, onSearch, busy }) {
  function submit(event) {
    event.preventDefault()
    onSearch(query)
  }

  return (
    <div>
      <h1 className="headline">What are you looking for?</h1>

      <form className="searchbar" onSubmit={submit}>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Show me job offers I might have missed"
          aria-label="Describe what you're looking for"
          autoFocus
        />
        <button
          className="scan-btn"
          type="submit"
          disabled={busy || !query.trim()}
          aria-label="Search"
        >
          {busy ? (
            <span className="spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12h13m0 0-5-5m5 5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </form>

      <div className="chips">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            className="chip"
            disabled={busy}
            onClick={() => {
              onQueryChange(example)
              onSearch(example)
            }}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  )
}
