export default function Header({ user, onSignOut }) {
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()

  return (
    <header className="header">
      <div className="brand">
        <span aria-hidden="true">🔍</span>
        Inbox Finder
      </div>
      <div className="header-right">
        {user?.picture ? (
          <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="avatar" aria-hidden="true">
            {initial}
          </div>
        )}
        <button className="signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  )
}
