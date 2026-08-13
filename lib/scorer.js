import {
  CATEGORIES,
  STOPWORDS,
  MISSED_HINTS,
  TIME_WINDOWS,
} from './categories.js'

const FIELD_WEIGHTS = { subject: 3, from: 2, snippet: 1 }
const DEFAULT_WINDOW = { gmail: '1y', days: 365 }
const MAX_SEARCH_TERMS = 14

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-word (or whole-phrase) match, so "art" doesn't match "start". */
function occurrences(haystack, term) {
  const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(term)}(?![a-z0-9])`, 'g')
  return (haystack.match(pattern) || []).length
}

/**
 * Turns a natural-language query into everything the scan needs: search terms
 * with weights, a time window, and whether to favour unread mail.
 */
export function parseQuery(rawQuery) {
  const query = String(rawQuery || '').toLowerCase().trim()

  const wantsUnread = MISSED_HINTS.some((hint) => query.includes(hint))

  const window =
    TIME_WINDOWS.find((w) => w.match.some((phrase) => query.includes(phrase))) ||
    DEFAULT_WINDOW

  const words = query
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const matchedCategories = CATEGORIES.filter((category) =>
    category.triggers.some((trigger) => words.includes(trigger))
  )

  // Collect weighted terms, keeping the highest weight if two categories
  // happen to share a term.
  const weights = new Map()
  function add(term, weight) {
    const existing = weights.get(term) || 0
    if (weight > existing) weights.set(term, weight)
  }

  for (const category of matchedCategories) {
    for (const [term, weight] of category.terms) add(term, weight)
  }

  // Meaningful words the user typed always count, so queries that match no
  // category ("emails from my landlord") still search for something sensible.
  const leftovers = words.filter(
    (word) => word.length > 2 && !STOPWORDS.has(word)
  )
  for (const word of leftovers) add(word, matchedCategories.length ? 12 : 25)

  const terms = [...weights.entries()]
    .map(([term, weight]) => ({ term, weight, phrase: term.includes(' ') }))
    .sort((a, b) => b.weight - a.weight)

  return {
    query,
    terms,
    wantsUnread,
    window,
    categories: matchedCategories.map((c) => c.id),
  }
}

/**
 * Builds a Gmail search string so Google filters server-side and we only pull
 * plausible candidates. Gmail's `{a b}` syntax means OR.
 */
export function buildGmailQuery(parsed) {
  const top = parsed.terms.slice(0, MAX_SEARCH_TERMS)
  if (!top.length) return `newer_than:${parsed.window.gmail}`

  const clauses = top.map(({ term, phrase }) => (phrase ? `"${term}"` : term))

  return `{${clauses.join(' ')}} newer_than:${parsed.window.gmail} -in:spam -in:trash`
}

/** Scores one email against the parsed query. Higher is more relevant. */
export function scoreEmail(email, parsed) {
  const fields = {
    subject: (email.subject || '').toLowerCase(),
    from: (email.from || '').toLowerCase(),
    snippet: (email.snippet || '').toLowerCase(),
  }

  let raw = 0
  const matched = []

  for (const { term, weight, phrase } of parsed.terms) {
    let termScore = 0

    for (const [field, multiplier] of Object.entries(FIELD_WEIGHTS)) {
      const count = occurrences(fields[field], term)
      if (!count) continue

      // Repeats matter, but with diminishing returns.
      const repeatFactor = 1 + Math.min(count - 1, 2) * 0.25
      termScore += weight * multiplier * repeatFactor
    }

    if (termScore > 0) {
      // Multi-word phrases are far stronger evidence than single keywords.
      if (phrase) termScore *= 1.5
      raw += termScore
      matched.push(term)
    }
  }

  if (raw === 0) return null

  // Recency: full boost today, decaying to nothing across the search window.
  if (email.date) {
    const ageDays = (Date.now() - new Date(email.date).getTime()) / 86_400_000
    const freshness = Math.max(0, 1 - ageDays / parsed.window.days)
    raw *= 1 + freshness * 0.35
  }

  // "Might have missed" means unread mail is what they're actually after.
  if (parsed.wantsUnread && email.unread) raw *= 1.4

  // Promotional blasts are rarely the personal thing someone is hunting for.
  if (email.labels?.includes('CATEGORY_PROMOTIONS')) raw *= 0.75

  return { raw, matched }
}

/** Scores, filters and sorts a batch of emails. Returns 0-100 scores. */
export function rankEmails(emails, parsed, limit = 50) {
  const scored = []

  for (const email of emails) {
    const result = scoreEmail(email, parsed)
    if (!result) continue
    scored.push({ email, raw: result.raw, matched: result.matched })
  }

  if (!scored.length) return []

  const best = Math.max(...scored.map((item) => item.raw))

  return scored
    .sort((a, b) => b.raw - a.raw)
    .slice(0, limit)
    .map(({ email, raw, matched }) => ({
      id: email.id,
      threadId: email.threadId,
      subject: email.subject,
      from: cleanSender(email.from),
      date: email.date,
      snippet: email.snippet,
      unread: email.unread,
      score: Math.max(1, Math.round((raw / best) * 100)),
      matched: matched.slice(0, 4),
    }))
}

/** "Jane Doe <jane@x.com>" -> "Jane Doe" */
function cleanSender(from) {
  if (!from) return ''
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</)
  if (named) return named[1].trim()
  return from.replace(/[<>]/g, '').trim()
}
