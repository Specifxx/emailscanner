import { useEffect, useRef, useState } from 'react'

export default function AccountMenu({
  user,
  plan,
  billing,
  onUpgrade,
  onManage,
  onSignOut,
  onDeleteAccount,
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return

    const onPointer = (event) => {
      if (!wrap.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()
  const capped = plan && plan.limit != null
  const remaining = capped ? Math.max(0, plan.limit - plan.used) : null

  const run = (fn) => () => {
    setOpen(false)
    fn?.()
  }

  return (
    <div className="account" ref={wrap}>
      <button
        className="account-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        {user?.picture ? (
          <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="avatar" aria-hidden="true">
            {initial}
          </div>
        )}
        <svg
          className={open ? 'caret up' : 'caret'}
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="menu" role="menu">
          <div className="menu-head">
            <div className="menu-name">{user?.name || 'Signed in'}</div>
            <div className="menu-email">{user?.email}</div>
          </div>

          {plan ? (
            <div className="menu-plan">
              <span className={plan.id === 'pro' ? 'plan-tag pro' : 'plan-tag'}>
                {plan.name}
              </span>
              <span className="plan-usage">
                {capped
                  ? `${remaining} of ${plan.limit} scans left today`
                  : 'Unlimited scans'}
              </span>
            </div>
          ) : null}

          <div className="menu-group">
            {plan?.id === 'free' ? (
              <button className="menu-item accent" role="menuitem" onClick={run(onUpgrade)}>
                Upgrade to Pro
              </button>
            ) : null}

            {plan?.id === 'pro' && billing ? (
              <button className="menu-item" role="menuitem" onClick={run(onManage)}>
                Manage billing
              </button>
            ) : null}
          </div>

          <div className="menu-group">
            <a className="menu-item" role="menuitem" href="/privacy.html">
              Privacy
            </a>
            <a className="menu-item" role="menuitem" href="/terms.html">
              Terms
            </a>
          </div>

          <div className="menu-group">
            <button className="menu-item" role="menuitem" onClick={run(onSignOut)}>
              Sign out
            </button>
            <button
              className="menu-item danger"
              role="menuitem"
              onClick={run(onDeleteAccount)}
            >
              Delete account
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
