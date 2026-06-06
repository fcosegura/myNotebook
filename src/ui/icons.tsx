export function NotebookEmptyIcon() {
  return (
    <span className="workspace-empty-icon" aria-hidden="true">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M6 4h12a1 1 0 0 1 1 1v14l-4-2.5L11 19V5a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1z" strokeLinejoin="round" />
        <path d="M11 5h8v12l-3-1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function PageEmptyIcon() {
  return (
    <span className="workspace-empty-icon" aria-hidden="true">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M7 4h10a1 1 0 0 1 1 1v14l-4-2-4 2V5a1 1 0 0 0 1-1H7a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1z" strokeLinejoin="round" />
        <path d="M9 8h6M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export function HeaderMenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18" r="1.5" />
    </svg>
  )
}

export function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 7h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" strokeLinejoin="round" />
    </svg>
  )
}

export function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z" />
    </svg>
  )
}

export function CloudSaveIcon({ saving, saved }: { saving: boolean; saved: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.5 3.5 0 0 0 7 18z" />
      {saving ? <circle cx="12" cy="14" r="2" fill="currentColor" stroke="none" opacity="0.7" /> : saved ? <path d="M9.5 14.5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  )
}

export function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 14H4V9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9a8 8 0 1 1 2 5.3" strokeLinecap="round" />
    </svg>
  )
}

export function RedoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 14h5V9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 9a8 8 0 1 0-2 5.3" strokeLinecap="round" />
    </svg>
  )
}

export function ListBulletIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="9" y1="6" x2="20" y2="6" strokeLinecap="round" />
      <line x1="9" y1="12" x2="20" y2="12" strokeLinecap="round" />
      <line x1="9" y1="18" x2="20" y2="18" strokeLinecap="round" />
      <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ListNumberIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="10" y1="6" x2="20" y2="6" strokeLinecap="round" />
      <line x1="10" y1="12" x2="20" y2="12" strokeLinecap="round" />
      <line x1="10" y1="18" x2="20" y2="18" strokeLinecap="round" />
      <text x="4" y="8" fill="currentColor" stroke="none" fontSize="7" fontFamily="system-ui">1</text>
      <text x="4" y="14" fill="currentColor" stroke="none" fontSize="7" fontFamily="system-ui">2</text>
      <text x="4" y="20" fill="currentColor" stroke="none" fontSize="7" fontFamily="system-ui">3</text>
    </svg>
  )
}

export function QuoteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 6h4v8H7V6zm0 0C7 4.3 8.3 3 10 3s3 1.3 3 3-1.3 3-3 3H7zm7 0h4v8h-4V6zm0 0c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3h-3z" opacity="0.85" />
    </svg>
  )
}
