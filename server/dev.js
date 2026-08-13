/**
 * Local dev server. Vercel runs the files in /api as serverless functions in
 * production; this wrapper mounts the same handlers on Express so `npm run dev`
 * works without the Vercel CLI. Vite proxies /api to this port.
 */
import 'dotenv/config'
import express from 'express'

const PORT = process.env.DEV_API_PORT || 3001

const ROUTES = [
  ['/api/auth/google', '../api/auth/google.js'],
  ['/api/auth/callback', '../api/auth/callback.js'],
  ['/api/auth/logout', '../api/auth/logout.js'],
  ['/api/me', '../api/me.js'],
  ['/api/scan', '../api/scan.js'],
]

const app = express()
app.use(express.json())

for (const [path, modulePath] of ROUTES) {
  app.all(path, async (req, res) => {
    try {
      const { default: handler } = await import(modulePath)
      await handler(req, res)
    } catch (err) {
      console.error(`${path} failed:`, err)
      if (!res.headersSent) res.status(500).json({ error: err.message })
    }
  })
}

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})
