import { Component } from 'react'

/**
 * Without this, any render error unmounts the whole tree and leaves a blank
 * white page with nothing to click — the worst possible failure for someone
 * arriving from a link.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('Render failed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="crash">
        <div className="crash-card">
          <div className="signin-mark" aria-hidden="true">
            🔍
          </div>
          <h1>Something broke on our end.</h1>
          <p>
            That's a bug, not something you did. Reloading usually fixes it — no
            mail or settings were affected.
          </p>
          <button className="tier-btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
