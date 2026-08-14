import AccountMenu from './AccountMenu.jsx'

export default function Header({
  user,
  plan,
  billing,
  onHome,
  onSignOut,
  onUpgrade,
  onManage,
  onDeleteAccount,
}) {
  const capped = plan && plan.limit != null
  const remaining = capped ? Math.max(0, plan.limit - plan.used) : null
  const low = capped && remaining <= Math.max(1, plan.limit * 0.2)

  return (
    <header className="header">
      <button className="brand brand-btn" onClick={onHome} aria-label="Home">
        <span aria-hidden="true">🔍</span>
        Email Scanner
      </button>

      <div className="header-right">
        {plan ? (
          <button
            className={low ? 'usage low' : 'usage'}
            onClick={plan.id === 'free' ? onUpgrade : undefined}
            title={
              capped
                ? `${plan.used} of ${plan.limit} scans used today`
                : 'Unlimited scans'
            }
          >
            {capped ? `${remaining} left` : 'Unlimited'}
          </button>
        ) : null}

        {plan?.id === 'free' ? (
          <button className="upgrade-btn" onClick={onUpgrade}>
            Upgrade
          </button>
        ) : null}

        <AccountMenu
          user={user}
          plan={plan}
          billing={billing}
          onUpgrade={onUpgrade}
          onManage={onManage}
          onSignOut={onSignOut}
          onDeleteAccount={onDeleteAccount}
        />
      </div>
    </header>
  )
}
