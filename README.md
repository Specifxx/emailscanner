# Email Scanner

Search your email in plain English. Type *"Show me job offers I might have missed"*
or *"Find wedding invites"* and get back the matching messages — read and unread —
sorted by relevance.

Connect as many mailboxes as you like, Gmail and Outlook side by side. One search
scans them all and merges the results into a single ranked list.

No LLM calls. Matching is a keyword dictionary plus a scoring function, so a
scan costs nothing beyond the mail API round-trips.

## How it works

1. **Parse the query.** Stopwords are dropped, then the remaining words are
   checked against ~10 category dictionaries (job offers, weddings, invites,
   travel, receipts, bills, shipping, appointments, finance, newsletters). The
   query is also checked for *"missed / unread"* hints and time windows like
   *"last month"*.
2. **Search every mailbox at once.** The top weighted terms are compiled into
   each provider's own search language — Gmail's `{"offer letter" recruiter …}
   newer_than:1y`, or Microsoft Graph's KQL `("offer letter" OR recruiter) AND
   received>=…` — so the server filters before anything is fetched.
3. **Fetch metadata.** Headers and a short preview only; message bodies are
   never requested. Gmail needs one request per message (ten at a time), Graph
   returns the whole page in one.
4. **Score.** Each keyword hit is weighted by where it appears (subject ×3,
   sender ×2, preview ×1), multi-word phrases count 1.5×, recent mail gets a
   boost, and unread mail is boosted when the query implies you missed it.
   Scores are normalised to 0–100 against the best match across all mailboxes.

If one mailbox fails — an expired token, a provider outage — the scan still
returns everything else and flags the one that needs reconnecting.

## Plans

| | Free | Pro |
|---|---|---|
| Scans | 5 per day | Unlimited |
| Mailboxes | 2 | Unlimited |
| Price | — | $24/month, or $20/month billed yearly |

Limits live in `lib/plans.js`, where `Infinity` means uncapped. Enforcement is
server-side in `api/scan.js`: a scan is claimed through the `consume_scan`
Postgres function before any mail API call, so going over costs nothing and two
concurrent scans can't both slip past the limit. The counter resets when its
window rolls over rather than by a cron job. Uncapped plans skip the counter
entirely — there is nothing to enforce, and the API reports their limit as
`null` because `Infinity` doesn't survive JSON.

Billing is optional. With no Stripe keys the app runs free-tier only and the
upgrade button reads "Coming soon"; set the keys in `.env.example` and checkout,
the billing portal, and the webhook all switch on. Only the webhook grants a
plan — the checkout redirect never does, so a user cannot self-upgrade by
hitting the success URL.

## Stack

React + Vite on the frontend, Node serverless functions in `/api`, the Gmail and
Microsoft Graph REST APIs, Supabase (Postgres) for accounts and tokens. Deploys
to Vercel.

```
src/                React app — landing page and search screen, one stylesheet
api/                Serverless functions (auth, me, accounts, scan, billing)
lib/                Config, session, encryption, Supabase, scorer, plans
lib/providers/      One adapter per mail provider, behind a shared interface
supabase/           Database schema
server/dev.js       Local Express wrapper so `npm run dev` works without Vercel
```

### Adding a provider

`lib/providers/` holds one module per provider, each exporting the same shape:
`buildAuthUrl`, `exchangeCode`, `refreshTokens`, `fetchProfile`, `buildQuery`
and `search`. `search` returns a normalised email
(`{id, subject, from, date, snippet, unread, promotional, url}`), which is all
the scorer and UI ever see. Register the module in `lib/providers/index.js` and
add its id to the `provider` check constraint in `supabase/schema.sql`.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste `supabase/schema.sql`, and run it.
   The `grant` statements at the bottom are not optional — new Supabase projects
   no longer expose `public` tables to the API automatically, and without them
   every request fails with *permission denied for table users*.
3. From **Project Settings → API Keys**, copy the project URL and a **secret**
   key (`sb_secret_…`). Not the publishable one.

### 2. Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **OAuth consent screen** → External. Add the scope
   `https://www.googleapis.com/auth/gmail.readonly`.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Add these Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback`
   - `https://your-app.vercel.app/api/auth/callback`
5. Copy the client ID and client secret.

While the app's publishing status is *Testing*, add your own account under
**Test users** or sign-in is blocked — and note Google expires refresh tokens
after 7 days in that state, so you'd have to reconnect weekly. Publishing the
app removes that expiry.

### 3. Microsoft / Outlook

1. At [entra.microsoft.com](https://entra.microsoft.com), go to
   **App registrations → New registration**.
2. Supported account types: the option that includes **personal Microsoft
   accounts** — otherwise outlook.com addresses cannot sign in.
3. Add a **Web** platform redirect URI (not "Single-page application", which
   caps refresh tokens at 24 hours):
   - `http://localhost:3000/api/auth/callback`
   - `https://your-app.vercel.app/api/auth/callback`
4. **Certificates & secrets → New client secret.** Copy the **Value** column
   immediately; it is unreadable once you leave the page.
5. **API permissions → Microsoft Graph → Delegated**: add `User.Read` and
   `Mail.Read`. `Mail.ReadBasic` is not enough — it omits the message preview
   this app ranks on.

### 4. Run it locally

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # http://localhost:3000
```

### 5. Deploy to Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new). The framework
   preset is detected as Vite; no build settings to change.
2. Add the variables from `.env.example` under
   **Settings → Environment Variables**, scoped to **Production**, with the URLs
   pointing at production:
   - `GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/auth/callback`
   - `APP_URL=https://your-app.vercel.app`
3. Redeploy — environment variables only apply to builds that come after them.
4. **Settings → Analytics → Enable.** The `<Analytics />` component is already
   wired into `src/main.jsx`; this switches on collection for the project. It
   only sends events when served by Vercel, so local dev stays silent.

## Security notes

- Mail access is **read-only** on both providers (`gmail.readonly`, `Mail.Read`).
- Tokens are encrypted with AES-256-GCM before being stored, so a database dump
  alone does not grant mailbox access.
- Sessions are signed JWTs in an httpOnly, SameSite=Lax cookie (Secure in
  production).
- The OAuth flow uses a per-provider `state` cookie to protect against CSRF, and
  the provider is only trusted after that value matches.
- Microsoft rotates refresh tokens on every refresh; the new one is persisted
  before use, or the chain would break once the original ages out.
- Both tables have RLS enabled with no policies — the API talks to them with the
  secret key, and the publishable key can read nothing.
- Never commit `.env`. The secret key bypasses all row-level security.

## Tuning the matching

Everything that decides *what counts as a match* lives in two files:

- `lib/categories.js` — the keyword dictionaries, their weights, and the trigger
  words that select a category. Add a category by appending to `CATEGORIES`.
- `lib/scorer.js` — field multipliers, the phrase bonus, recency decay, and the
  unread boost.
