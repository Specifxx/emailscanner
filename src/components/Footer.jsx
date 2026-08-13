export default function Footer({ onDeleteAccount }) {
  return (
    <footer className="app-footer">
      <a href="/privacy.html">Privacy</a>
      <a href="/terms.html">Terms</a>
      <button className="delete-account" onClick={onDeleteAccount}>
        Delete account
      </button>
    </footer>
  )
}
