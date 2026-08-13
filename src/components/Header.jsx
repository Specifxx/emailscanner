export default function Header({
  user,
  plan,
  billing,
  onSignOut,
  onUpgrade,
  onManage,
}) {
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()

  // limit === null means uncapped, which is different from "not loaded yet".
  const capped = plan && plan.limit != null
  const remaining = capped ? Math.max(0, plan.limit - plan.used) : null
  const low = capped && remaining <= Math.max(1, plan.limit * 0.2)

  return (
    <header className="header">
      <div className="brand">
        <span aria-hidden="true">🔍</span>
        Email Scanner
      </div>

      <div className="header-right">
        {plan ? (
          <span
            className={low ? 'usage low' : 'usage'}
            title={
              capped
                ? `${plan.used} of ${plan.limit} scans used today`
                : 'Unlimited scans'
            }
          >
            {capped ? `${remaining} left` : 'Unlimited'}
          </span>
        ) : null}

        {plan?.id === 'free' && billing ? (
          <button className="upgrade-btn" onClick={onUpgrade}>
            Upgrade
          </button>
        ) : null}

        {plan?.id === 'pro' && billing ? (
          <button className="signout" onClick={onManage}>
            Billing
          </button>
        ) : null}

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
