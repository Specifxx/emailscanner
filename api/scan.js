import { getSession } from '../lib/session.js'
import { getUserById } from '../lib/supabase.js'
import {
  AuthError,
  getAccessToken,
  searchMessages,
  fetchMessages,
} from '../lib/gmail.js'
import { parseQuery, buildGmailQuery, rankEmails } from '../lib/scorer.js'

const MAX_CANDIDATES = 100

async function readBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ error: 'Please sign in again.' })
  }

  let query
  try {
    ;({ query } = await readBody(req))
  } catch {
    return res.status(400).json({ error: 'Could not read your request.' })
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Type what you are looking for.' })
  }

  try {
    const user = await getUserById(session.uid)
    if (!user) {
      return res.status(401).json({ error: 'Please sign in again.' })
    }

    const accessToken = await getAccessToken(user)

    const parsed = parseQuery(query)
    const gmailQuery = buildGmailQuery(parsed)

    const ids = await searchMessages(accessToken, gmailQuery, MAX_CANDIDATES)
    if (!ids.length) {
      return res.status(200).json({ emails: [], scanned: 0, query: gmailQuery })
    }

    const messages = await fetchMessages(accessToken, ids)
    const emails = rankEmails(messages, parsed)

    res.status(200).json({
      emails,
      scanned: messages.length,
      categories: parsed.categories,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(401).json({ error: err.message })
    }
    console.error('Scan failed:', err)
    res.status(500).json({ error: err.message || 'Scan failed. Try again.' })
  }
}
