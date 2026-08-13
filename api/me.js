import { getSession } from '../lib/session.js'

export default function handler(req, res) {
  const session = getSession(req)

  if (!session) {
    return res.status(200).json({ user: null })
  }

  res.status(200).json({
    user: {
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
  })
}
