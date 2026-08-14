/**
 * Turns content/*.md into static HTML under public/guides/, and writes
 * sitemap.xml.
 *
 * These are real server-rendered pages, not routes inside the SPA. Search
 * engines can render JavaScript, but static HTML is indexed faster and more
 * reliably, and a guide has no reason to boot React to show a paragraph.
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { marked } from 'marked'

const ROOT = path.resolve(import.meta.dirname, '..')
const CONTENT = path.join(ROOT, 'content')
const OUT = path.join(ROOT, 'public', 'guides')
const SITE = process.env.SITE_URL || 'https://www.scanmyemails.com'

/** Minimal frontmatter: `key: value` lines between --- fences. */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { meta: {}, body: raw }

  const meta = {}
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':')
    if (index === -1) continue
    meta[line.slice(0, index).trim()] = line
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return { meta, body: raw.slice(match[0].length) }
}

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

function page({ meta, html, slug }) {
  const url = `${SITE}/guides/${slug}`
  // Article structured data gives Google the title, date and publisher
  // explicitly rather than making it infer them from the markup.
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.description,
    datePublished: meta.date,
    dateModified: meta.updated || meta.date,
    author: { '@type': 'Organization', name: 'Email Scanner' },
    publisher: { '@type': 'Organization', name: 'Email Scanner' },
    mainEntityOfPage: url,
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(meta.title)}</title>
    <meta name="description" content="${escape(meta.description)}" />
    <link rel="canonical" href="${url}" />
    <meta name="theme-color" content="#fafafa" />

    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escape(meta.title)}" />
    <meta property="og:description" content="${escape(meta.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE}/og.png" />

    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#128269;</text></svg>" />
    <script type="application/ld+json">${JSON.stringify(schema)}</script>
    <style>
      *{box-sizing:border-box}
      body{margin:0;background:#fafafa;color:#18181b;font-size:17px;line-height:1.65;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
        -webkit-font-smoothing:antialiased}
      .wrap{max-width:44rem;margin:0 auto;padding:0 22px 72px}
      nav{display:flex;align-items:center;justify-content:space-between;padding:20px 0}
      .brand{display:flex;align-items:center;gap:8px;font-weight:600;color:inherit;text-decoration:none}
      .try{border:1px solid #e8e8ec;background:#fff;border-radius:999px;padding:7px 15px;
        font-size:14px;color:#2563eb;text-decoration:none;font-weight:550}
      .try:hover{border-color:#c9d8fb}
      article{padding-top:26px}
      h1{font-size:40px;line-height:1.12;letter-spacing:-.032em;font-weight:680;margin:0 0 12px;text-wrap:balance}
      .meta{color:#a1a1aa;font-size:13.5px;margin-bottom:34px}
      h2{font-size:25px;letter-spacing:-.022em;font-weight:650;margin:42px 0 12px;text-wrap:balance}
      h3{font-size:19px;font-weight:620;margin:30px 0 8px}
      p,li{color:#3f3f46}
      a{color:#2563eb}
      code{background:#f2f4f8;border-radius:5px;padding:2px 6px;font-size:15px;color:#18181b}
      pre{background:#fff;border:1px solid #e8e8ec;border-radius:12px;padding:16px 18px;overflow-x:auto}
      pre code{background:none;padding:0}
      blockquote{margin:26px 0;padding:2px 0 2px 20px;border-left:3px solid #c9d8fb;color:#52525b}
      table{width:100%;border-collapse:collapse;margin:24px 0;font-size:15.5px;display:block;overflow-x:auto}
      th,td{border-bottom:1px solid #e8e8ec;padding:10px 12px;text-align:left}
      th{font-weight:620}
      hr{border:0;border-top:1px solid #e8e8ec;margin:44px 0}
      .cta{margin:48px 0 0;padding:26px;background:#fff;border:1px solid #e8e8ec;border-radius:16px;text-align:center}
      .cta strong{display:block;font-size:19px;font-weight:650;letter-spacing:-.02em;margin-bottom:6px}
      .cta p{margin:0 0 18px;font-size:15px;color:#52525b}
      .cta a{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;
        border-radius:999px;padding:11px 24px;font-weight:550;font-size:15px}
      footer{margin-top:52px;padding-top:22px;border-top:1px solid #e8e8ec;
        color:#a1a1aa;font-size:12.5px;text-align:center}
      footer a{color:#a1a1aa;text-decoration:none;margin:0 8px}
      @media(max-width:600px){body{font-size:16px}h1{font-size:31px}h2{font-size:22px}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <nav>
        <a class="brand" href="/"><span>🔍</span> Email Scanner</a>
        <a class="try" href="/">Try it free</a>
      </nav>

      <article>
        <h1>${escape(meta.title)}</h1>
        <div class="meta">Updated ${escape(meta.updated || meta.date)}</div>
        ${html}
      </article>

      <div class="cta">
        <strong>Stop hunting through your inbox.</strong>
        <p>Search Gmail in plain English. Free, read-only, and your emails are never opened.</p>
        <a href="/">Try Email Scanner</a>
      </div>

      <footer>
        <a href="/">Home</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a>
      </footer>
    </div>
  </body>
</html>
`
}

const files = (await readdir(CONTENT).catch(() => [])).filter((f) =>
  f.endsWith('.md')
)

const pages = []
for (const file of files) {
  const raw = await readFile(path.join(CONTENT, file), 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  const slug = meta.slug || file.replace(/\.md$/, '')

  if (!meta.title || !meta.description) {
    throw new Error(`${file} needs a title and description in its frontmatter`)
  }

  // Written as a directory so the URL is /guides/<slug> with no extension.
  await mkdir(path.join(OUT, slug), { recursive: true })
  await writeFile(
    path.join(OUT, slug, 'index.html'),
    page({ meta, html: marked.parse(body), slug })
  )
  pages.push({ slug, date: meta.updated || meta.date })
  console.log(`  guides/${slug}`)
}

const urls = [
  { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
  ...pages.map((p) => ({
    loc: `${SITE}/guides/${p.slug}`,
    lastmod: p.date,
    changefreq: 'monthly',
    priority: '0.8',
  })),
  { loc: `${SITE}/privacy.html`, changefreq: 'monthly', priority: '0.3' },
  { loc: `${SITE}/terms.html`, changefreq: 'monthly', priority: '0.3' },
]

await writeFile(
  path.join(ROOT, 'public', 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join('\n')}
</urlset>
`
)

console.log(`  sitemap.xml (${urls.length} urls)`)
