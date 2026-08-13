/**
 * Reads a JSON body. Vercel parses it for us; the local Express wrapper and
 * raw Node do not, so fall back to draining the stream.
 */
export async function readJsonBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
