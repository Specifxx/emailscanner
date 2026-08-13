import ProviderMark from './ProviderMark.jsx'
import * as api from '../api.js'

export default function Mailboxes({ accounts, providers, onDisconnect, needsReconnect }) {
  return (
    <div className="mailboxes">
      {accounts.map((account) => {
        const stale = needsReconnect.includes(account.id)
        return (
          <span
            className={stale ? 'mailbox stale' : 'mailbox'}
            key={account.id}
            title={stale ? 'Needs reconnecting' : account.label}
          >
            <ProviderMark provider={account.provider} />
            {account.email}
            <button
              className="mailbox-remove"
              onClick={() => onDisconnect(account)}
              aria-label={`Disconnect ${account.email}`}
            >
              ×
            </button>
          </span>
        )
      })}

      {providers.map((provider) => (
        <button
          className="mailbox add"
          key={provider.id}
          onClick={() => api.connect(provider.id)}
        >
          <ProviderMark provider={provider.id} />
          Add {provider.label}
        </button>
      ))}
    </div>
  )
}
