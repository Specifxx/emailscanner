import { totalScans } from '../lib/supabase.js'
import { SCAN_COUNT_BASELINE } from '../lib/plans.js'

/**
 * Public, unauthenticated — it only ever exposes one aggregate number. Cached
 * briefly at the edge so the landing page doesn't hit the database on every
 * visit.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  try {
    res.status(200).json({ scans: SCAN_COUNT_BASELINE + (await totalScans()) })
  } catch (err) {
    // The landing page should still render if the database is unreachable.
    console.error('Could not load scan count:', err)
    res.status(200).json({ scans: SCAN_COUNT_BASELINE })
  }
}
