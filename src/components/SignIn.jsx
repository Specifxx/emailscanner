import * as api from '../api.js'
import ProviderMark from './ProviderMark.jsx'

export default function SignIn({ providers }) {
  return (
    <div className="signin-page">
      <div className="signin-card">
        <div className="signin-mark">🔍</div>
        <h1>Find what your inbox buried.</h1>
        <p>Search your email the way you'd say it out loud.</p>

        <div className="signin-buttons">
          {providers.map((provider) => (
            <button
              key={provider.id}
              className="provider-btn"
              onClick={() => api.connect(provider.id)}
            >
              <ProviderMark provider={provider.id} />
              Continue with {provider.label}
            </button>
          ))}
        </div>

        <p className="signin-note">
          Read-only access. Nothing is sent to an AI.
        </p>
      </div>
    </div>
  )
}
