import { HeaderMenuIcon } from './icons'
import type { SearchResult } from '../features/search/search'

type AppHeaderProps = {
  actionsOpen: boolean
  searchTerm: string
  lastSavedAt: number | null
  notebooksHidden: boolean
  logoutPending: boolean
  forceSavePending: boolean
  pastingImage: boolean
  searchResults: SearchResult[]
  backupStatus: string
  backupStatusType: 'success' | 'error' | 'info'
  onSearch: (term: string) => void
  onToggleActions: () => void
  onExportEncryptedBackup: () => void
  onImportEncryptedBackup: () => void
  onPinChange: () => void
  onToggleNotebooksHidden: () => void
  onLogout: () => void
  onOpenSearchResult: (result: SearchResult) => void
  formatLastSavedDisplay: (ts: number) => string
}

export function AppHeader({
  actionsOpen,
  searchTerm,
  lastSavedAt,
  notebooksHidden,
  logoutPending,
  forceSavePending,
  pastingImage,
  searchResults,
  backupStatus,
  backupStatusType,
  onSearch,
  onToggleActions,
  onExportEncryptedBackup,
  onImportEncryptedBackup,
  onPinChange,
  onToggleNotebooksHidden,
  onLogout,
  onOpenSearchResult,
  formatLastSavedDisplay,
}: AppHeaderProps) {
  return (
    <>
      <div className="app-header-block">
        <header className="app-header">
          <div className="app-header-start">
            <h1>Libreta local</h1>
            <label className="search-input-wrap" aria-label="Busqueda global">
              <span className="search-icon" aria-hidden="true">🔎</span>
              <input
                className="search-input"
                placeholder="Busqueda global inteligente..."
                value={searchTerm}
                onChange={(event) => onSearch(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className={`app-header-actions-btn${actionsOpen ? ' is-open' : ''}`}
            onClick={onToggleActions}
            aria-expanded={actionsOpen}
            aria-haspopup="true"
            aria-label="Acciones y configuracion"
            title="Acciones"
          >
            <HeaderMenuIcon />
          </button>
        </header>
        {actionsOpen ? (
          <section className="actions-menu">
            <p className="actions-menu-meta" role="status">
              {lastSavedAt !== null ? (
                <>
                  Ultimo guardado local:{' '}
                  <time dateTime={new Date(lastSavedAt).toISOString()}>
                    {formatLastSavedDisplay(lastSavedAt)}
                  </time>
                </>
              ) : (
                'Aun no hay guardados en esta sesion.'
              )}
            </p>
            <button type="button" onClick={onExportEncryptedBackup}>Exportar cifrado</button>
            <button type="button" onClick={onImportEncryptedBackup}>Importar cifrado</button>
            <button type="button" onClick={onPinChange}>Cambiar PIN</button>
            <button type="button" onClick={onToggleNotebooksHidden}>
              {notebooksHidden ? 'Mostrar barra de libretas' : 'Ocultar barra de libretas'}
            </button>
            <button
              type="button"
              className="actions-logout-button"
              disabled={logoutPending || forceSavePending || pastingImage}
              onClick={onLogout}
              title="Guarda la nota actual, bloquea la sesion y vuelve al PIN (los datos quedan en este dispositivo)"
            >
              {logoutPending ? 'Cerrando sesion...' : 'Cerrar sesion'}
            </button>
          </section>
        ) : null}
      </div>
      {backupStatus ? <p className={`backup-status ${backupStatusType}`}>{backupStatus}</p> : null}
      {searchResults.length > 0 ? (
        <section className="search-results">
          {searchResults.map((result) => (
            <button key={result.pageId} type="button" onClick={() => onOpenSearchResult(result)}>
              <strong>{result.pageTitle}</strong> en {result.notebookTitle}
              <span>{result.snippet}</span>
            </button>
          ))}
        </section>
      ) : null}
    </>
  )
}
