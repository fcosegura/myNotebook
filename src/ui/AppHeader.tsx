import { HeaderMenuIcon } from './icons'
import { getParsedDateFilterLabel, type SearchResult } from '../features/search/search'

type AppHeaderProps = {
  actionsOpen: boolean
  commandOpen: boolean
  searchTerm: string
  lastSavedAt: number | null
  spacesHidden: boolean
  canCreatePage: boolean
  canCreateSpace: boolean
  logoutPending: boolean
  forceSavePending: boolean
  pastingImage: boolean
  searchResults: SearchResult[]
  backupStatus: string
  backupStatusType: 'success' | 'error' | 'info'
  onSearch: (term: string) => void
  onToggleCommand: () => void
  onToggleActions: () => void
  onCreatePage: () => void
  onCreateSpace: () => void
  onShowBookmarks: () => void
  onExportEncryptedBackup: () => void
  onImportEncryptedBackup: () => void
  onPinChange: () => void
  onToggleSpacesHidden: () => void
  onLogout: () => void
  onOpenSearchResult: (result: SearchResult) => void
  formatLastSavedDisplay: (ts: number) => string
}

export function AppHeader({
  actionsOpen,
  commandOpen,
  searchTerm,
  lastSavedAt,
  spacesHidden,
  canCreatePage,
  canCreateSpace,
  logoutPending,
  forceSavePending,
  pastingImage,
  searchResults,
  backupStatus,
  backupStatusType,
  onSearch,
  onToggleCommand,
  onToggleActions,
  onCreatePage,
  onCreateSpace,
  onShowBookmarks,
  onExportEncryptedBackup,
  onImportEncryptedBackup,
  onPinChange,
  onToggleSpacesHidden,
  onLogout,
  onOpenSearchResult,
  formatLastSavedDisplay,
}: AppHeaderProps) {
  const dateFilterLabel = getParsedDateFilterLabel(searchTerm)

  return (
    <>
      <div className="app-header-block">
        <header className="app-header">
          <div className="app-header-start">
            <h1>Espacios</h1>
            <label className="search-input-wrap" aria-label="Búsqueda en espacios">
              <span className="search-icon" aria-hidden="true">🔎</span>
              <input
                className="search-input"
                placeholder="Buscar en tus espacios…"
                value={searchTerm}
                onChange={(event) => onSearch(event.target.value)}
              />
              {dateFilterLabel ? (
                <span className="search-date-chip" title="Filtro temporal detectado">
                  {dateFilterLabel}
                </span>
              ) : null}
            </label>
          </div>
          <div className="app-header-quick-actions">
            <button
              type="button"
              className="header-primary-action"
              disabled={!canCreatePage}
              onClick={onCreatePage}
              title={canCreatePage ? 'Nueva página rápida' : 'Selecciona un espacio para crear una página'}
            >
              + Página
            </button>
            <button
              type="button"
              className={`header-command-action${commandOpen ? ' is-open' : ''}`}
              onClick={onToggleCommand}
              aria-expanded={commandOpen}
              aria-haspopup="true"
              title="Acciones rápidas"
            >
              Acciones rápidas
            </button>
          </div>
          <button
            type="button"
            className={`app-header-actions-btn${actionsOpen ? ' is-open' : ''}`}
            onClick={onToggleActions}
            aria-expanded={actionsOpen}
            aria-haspopup="true"
            aria-label="Acciones y configuración"
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
                  Último guardado local:{' '}
                  <time dateTime={new Date(lastSavedAt).toISOString()}>
                    {formatLastSavedDisplay(lastSavedAt)}
                  </time>
                </>
              ) : (
                'Aún no hay guardados en esta sesión.'
              )}
            </p>
            <strong className="actions-menu-section">Configuración y datos</strong>
            <button type="button" onClick={onExportEncryptedBackup}>Exportar cifrado</button>
            <button type="button" onClick={onImportEncryptedBackup}>Importar cifrado</button>
            <button type="button" onClick={onPinChange}>Cambiar PIN</button>
            <button type="button" onClick={onToggleSpacesHidden}>
              {spacesHidden ? 'Mostrar barra de espacios' : 'Ocultar barra de espacios'}
            </button>
            <button
              type="button"
              className="actions-logout-button"
              disabled={logoutPending || forceSavePending || pastingImage}
              onClick={onLogout}
              title="Guarda la nota actual, bloquea la sesión y vuelve al PIN (los datos quedan en este dispositivo)"
            >
              {logoutPending ? 'Cerrando sesión...' : 'Cerrar sesión'}
            </button>
          </section>
        ) : null}
        {commandOpen ? (
          <section className="command-menu" aria-label="Acciones rápidas">
            <button type="button" disabled={!canCreatePage} onClick={onCreatePage}>
              <strong>Crear página</strong>
              <span>Abre una nota nueva y lista para escribir.</span>
            </button>
            <button type="button" disabled={!canCreateSpace} onClick={onCreateSpace}>
              <strong>Crear espacio</strong>
              <span>{canCreateSpace ? 'Organiza un nuevo espacio de notas.' : 'Cambia a Activas para crear espacios.'}</span>
            </button>
            <button type="button" onClick={onShowBookmarks}>
              <strong>Ver favoritos</strong>
              <span>Salta a tus páginas marcadas.</span>
            </button>
            <button type="button" onClick={onExportEncryptedBackup}>
              <strong>Exportar backup</strong>
              <span>Guarda una copia cifrada.</span>
            </button>
          </section>
        ) : null}
      </div>
      {backupStatus ? <p className={`backup-status ${backupStatusType}`}>{backupStatus}</p> : null}
      {searchResults.length > 0 ? (
        <section className="search-results">
          {searchResults.map((result) => (
            <button key={result.pageId} type="button" onClick={() => onOpenSearchResult(result)}>
              <strong>{result.pageTitle}</strong> en {result.spaceTitle}
              <span>{result.snippet}</span>
            </button>
          ))}
        </section>
      ) : null}
    </>
  )
}
