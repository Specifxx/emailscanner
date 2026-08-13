# Email Scanner

Search your Gmail in plain English. Type *"Show me job offers I might have missed"*
or *"Find wedding invites"* and get back the matching emails — read and unread —
sorted by relevance.

No LLM calls. Matching is a keyword dictionary plus a scoring function, so a
scan costs nothing beyond the Gmail API round-trips.

## How it works

1. **Parse the query.** Stopwords are dropped, then the remaining words are
   checked against ~10 category dictionaries (job offers, weddings, invites,
   travel, receipts, bills, shipping, appointments, finance, newsletters). The
   query is also checked for *"missed / unread"* hints and time windows like
   *"last month"*.
2. **Search Gmail.** The top weighted terms become a Gmail search string
   (`{"offer letter" "job offer" recruiter …} newer_than:1y`) so Google filters
   server-side and only plausible candidates get fetched.
3. **Fetch metadata.** Up to 100 messages, headers and snippet only, ten at a
   time. Message bodies are never requested.
4. **Score.** Each keyword hit is weighted by where it appears (subject ×3,
   sender ×2, snippet ×1), multi-word phrases count 1.5×, recent mail gets a
   boost, and unread mail is boosted when the query implies you missed it.
   Scores are normalised to 0–100 against the best match.

## Stack

React + Vite on the frontend, Node serverless functions in `/api`, Gmail REST
API, Supabase (Postgres) for users and tokens. Deploys to Vercel.

```
src/           React app — two screens, one stylesheet, no UI framework
api/           Serverless functions (auth, me, scan)
lib/           Config, session, encryption, Supabase, Gmail, scorer
supabase/      Database schema
server/dev.js  Local Express wrapper so `npm run dev` works without Vercel CLI
```

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste `supabase/schema.sql`, and run it.
3. Copy the project URL and the **service role** key from
   **Project Settings → API**.

### 2. Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **OAuth consent screen** → External. Add the scope
   `https://www.googleapis.com/auth/gmail.readonly`. While the app is in
   *Testing*, add your own Google account under **Test users** — otherwise sign-in
   is blocked.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Add these Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback`
   - `https://your-app.vercel.app/api/auth/callback`
5. Copy the client ID and client secret.

### 3. Run it locally

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # http://localhost:3000
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Deploy to Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new). The framework
   preset is detected as Vite; no build settings to change.
2. Add all the variables from `.env.example` under
   **Settings → Environment Variables**, but point the URLs at production:
   - `GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/auth/callback`
   - `APP_URL=https://your-app.vercel.app`
3. Redeploy, and confirm that same redirect URI is listed on the Google OAuth
   client.

## Security notes

- Gmail access is **read-only** (`gmail.readonly`).
- Google tokens are encrypted with AES-256-GCM before being stored in Supabase,
  so a database dump alone does not grant mailbox access.
- Sessions are signed JWTs in an httpOnly, SameSite=Lax cookie (Secure in
  production).
- The OAuth flow uses a `state` cookie to protect against CSRF.
- `users` has RLS enabled with no policies — the API talks to it with the
  service-role key, and the anon key can read nothing.
- Never commit `.env`. The service role key bypasses all row-level security.

## Tuning the matching

Everything that decides *what counts as a match* lives in two files:

- `lib/categories.js` — the keyword dictionaries, their weights, and the trigger
  words that select a category. Add a category by appending to `CATEGORIES`.
- `lib/scorer.js` — field multipliers, the phrase bonus, recency decay, and the
  unread boost.
