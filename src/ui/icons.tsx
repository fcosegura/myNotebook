export function SpaceEmptyIcon() {
  return (
    <span className="workspace-empty-icon" aria-hidden="true">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
        <rect x="3" y="4" width="10" height="8" rx="1.5" />
        <rect x="11" y="10" width="10" height="10" rx="1.5" />
        <path d="M7 8h2M14 14h4M14 17h3" strokeLinecap="round" />
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

export function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-5-5z" strokeLinejoin="round" />
      <path d="M13 3v5h5" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`tree-chevron-icon${expanded ? ' is-expanded' : ''}`}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
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
