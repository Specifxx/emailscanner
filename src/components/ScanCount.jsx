import { useEffect, useRef, useState } from 'react'
import * as api from '../api.js'

const DURATION = 1100

/** Ease-out so the count decelerates into its final value. */
function easeOut(t) {
  return 1 - Math.pow(1 - t, 3)
}

export default function ScanCount() {
  const [target, setTarget] = useState(null)
  const [shown, setShown] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    let cancelled = false
    api
      .getStats()
      .then((data) => {
        if (!cancelled) setTarget(data.scans)
      })
      .catch(() => {
        // Silent: a missing count is better than an error on the landing page.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (target == null) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setShown(target)
      return
    }

    const start = performance.now()
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / DURATION)
      setShown(Math.round(easeOut(progress) * target))
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target])

  // Nothing renders until the number is known, so the layout doesn't jump from
  // a placeholder to a real figure.
  if (target == null) return null

  return (
    <div className="scan-count">
      <strong>{shown.toLocaleString()}</strong>
      <span>scans run and counting</span>
    </div>
  )
}
