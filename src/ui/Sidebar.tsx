import type { MouseEvent } from 'react'
import type { Notebook, Page } from '../storage/db'
import { BookmarkIcon, FolderIcon } from './icons'

type BookmarkGroup = {
  notebook: Notebook
  pages: Page[]
}

type SidebarProps = {
  notebooksHidden: boolean
  notebooksCollapsed: boolean
  sidebarPanelMode: 'library' | 'bookmarks'
  sidebarView: 'notebooks' | 'pages'
  selectedNotebookId: string | null
  selectedPageId: string | null
  selectedNotebook: Notebook | null
  selectedNotebookReadOnly: boolean
  pages: Page[]
  sidebarNotebooks: Notebook[]
  notebookSidebarMode: 'active' | 'archived'
  bookmarkTree: BookmarkGroup[]
  notebookMenuId: string | null
  pageMenuId: string | null
  onExpandNotebooks: () => void
  onCollapseNotebooks: () => void
  onSidebarPanelModeChange: (mode: 'library' | 'bookmarks') => void
  onSidebarViewChange: (view: 'notebooks' | 'pages') => void
  onNotebookSidebarModeChange: (mode: 'active' | 'archived') => void
  onNotebookCreate: () => void
  onPageCreate: () => void
  onSelectNotebook: (notebookId: string) => void
  onSelectPage: (pageId: string) => void
  onToggleNotebookMenu: (notebookId: string) => void
  onTogglePageMenu: (pageId: string) => void
  onNotebookRename: (notebook: Notebook) => void
  onNotebookArchive: (notebook: Notebook) => void
  onNotebookUnarchive: (notebook: Notebook) => void
  onNotebookDelete: (notebook: Notebook) => void
  onPageBookmark: (page: Page) => void
  onPageMove: () => void
  onPageDelete: (page: Page) => void
  onBookmarkNotebookToggle: (notebookId: string) => void
  isBookmarkNotebookExpanded: (notebookId: string) => boolean
  isLibraryNotebookExpanded: (notebookId: string) => boolean
  onOpenBookmarkPage: (pageId: string) => void
  isNotebookArchived: (notebook: Notebook) => boolean
  isPageBookmarked: (page: { tags: string[] }) => boolean
  formatPageUpdatedAt: (ts: number) => string
  getPagePreview: (page: Page) => string
}

export function Sidebar(props: SidebarProps) {
  const {
    notebooksHidden,
    notebooksCollapsed,
    sidebarPanelMode,
    selectedNotebookId,
    selectedPageId,
    selectedNotebookReadOnly,
    pages,
    sidebarNotebooks,
    notebookSidebarMode,
    bookmarkTree,
    notebookMenuId,
    pageMenuId,
    onExpandNotebooks,
    onCollapseNotebooks,
    onSidebarPanelModeChange,
    onSidebarViewChange,
    onNotebookSidebarModeChange,
    onNotebookCreate,
    onPageCreate,
    onSelectNotebook,
    onSelectPage,
    onToggleNotebookMenu,
    onTogglePageMenu,
    onNotebookRename,
    onNotebookArchive,
    onNotebookUnarchive,
    onNotebookDelete,
    onPageBookmark,
    onPageMove,
    onPageDelete,
    onBookmarkNotebookToggle,
    isBookmarkNotebookExpanded,
    isLibraryNotebookExpanded,
    onOpenBookmarkPage,
    isNotebookArchived,
    isPageBookmarked,
    formatPageUpdatedAt,
    getPagePreview,
  } = props

  if (notebooksHidden) {
    return null
  }

  return (
    <aside className={`column notebooks master-sidebar${notebooksCollapsed ? ' collapsed' : ''}`}>
      {notebooksCollapsed ? (
        <button
          type="button"
          className="collapse-toggle collapsed-toggle"
          onClick={onExpandNotebooks}
          aria-label="Expandir libretas"
          title="Expandir libretas"
        >
          <span className="collapsed-label">Libretas</span>
          <span aria-hidden="true">›</span>
        </button>
      ) : (
        <>
          <div className="sidebar-panel-switch" role="tablist" aria-label="Vista de la barra lateral">
            <button
              type="button"
              role="tab"
              aria-selected={sidebarPanelMode === 'library'}
              className={`sidebar-panel-switch-btn${sidebarPanelMode === 'library' ? ' is-active' : ''}`}
              title="Libretas y páginas"
              aria-label="Libretas y páginas"
              onClick={() => onSidebarPanelModeChange('library')}
            >
              <FolderIcon />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarPanelMode === 'bookmarks'}
              className={`sidebar-panel-switch-btn${sidebarPanelMode === 'bookmarks' ? ' is-active' : ''}`}
              title="Favoritos"
              aria-label="Favoritos"
              onClick={() => onSidebarPanelModeChange('bookmarks')}
            >
              <BookmarkIcon filled={sidebarPanelMode === 'bookmarks'} />
            </button>
          </div>
          {sidebarPanelMode === 'bookmarks' ? (
            <div className="notebook-tree bookmarks-tree" aria-label="Favoritos por libreta">
              <h2 className="sidebar-section-label">Favoritos</h2>
              {bookmarkTree.length === 0 ? (
                <div className="notebook-sidebar-empty sidebar-empty-card">
                  <p>No hay páginas favoritas todavía.</p>
                  <button type="button" onClick={() => onSidebarPanelModeChange('library')}>
                    Volver a libretas
                  </button>
                </div>
              ) : (
                bookmarkTree.map(({ notebook, pages }) => {
                  const expanded = isBookmarkNotebookExpanded(notebook.id)
                  return (
                    <div key={notebook.id} className="bookmark-notebook-group">
                      <div className="notebook-tree-header list-item-shell">
                        <button
                          type="button"
                          className="notebook-tree-folder-btn"
                          aria-expanded={expanded}
                          onClick={() => onBookmarkNotebookToggle(notebook.id)}
                        >
                          <span className="notebook-tree-chevron" aria-hidden="true">
                            {expanded ? '▾' : '›'}
                          </span>
                          <span className="item-icon notebook-folder-icon" aria-hidden="true">
                            📁
                          </span>
                          <span className="notebook-tree-name">{notebook.title}</span>
                        </button>
                      </div>
                      {expanded ? (
                        <ul className="pages-tree" aria-label={`Páginas favoritas de ${notebook.title}`}>
                          {pages.map((page) => (
                            <li
                              key={page.id}
                              className={`page-tree-item list-item-shell${page.id === selectedPageId ? ' active' : ''}`}
                            >
                              <button
                                type="button"
                                className={`page-tree-link${page.id === selectedPageId ? ' active' : ''}`}
                                onClick={() => onOpenBookmarkPage(page.id)}
                              >
                                <PageTreeTitle
                                  page={page}
                                  isPageBookmarked={isPageBookmarked}
                                  formatPageUpdatedAt={formatPageUpdatedAt}
                                  getPagePreview={getPagePreview}
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            <>
              <div className="column-title section-title">
                <div className="column-title-left">
                  <button
                    type="button"
                    className="collapse-toggle"
                    onClick={onCollapseNotebooks}
                    aria-label="Colapsar libretas"
                    title="Colapsar libretas"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <h2>Libretas</h2>
                </div>
                <div className="sidebar-title-actions">
                  <button
                    type="button"
                    className="new-page-action"
                    aria-label="Nueva página"
                    title={selectedNotebookReadOnly ? 'Las libretas archivadas son de solo lectura' : selectedNotebookId ? 'Nueva página' : 'Selecciona una libreta'}
                    disabled={!selectedNotebookId || selectedNotebookReadOnly}
                    onClick={onPageCreate}
                  >
                    + Página
                  </button>
                  <button
                    type="button"
                    className="new-notebook-action"
                    aria-label="Nueva libreta"
                    title={notebookSidebarMode === 'archived' ? 'Cambia a Activas para crear una libreta' : 'Nueva libreta'}
                    disabled={notebookSidebarMode === 'archived'}
                    onClick={onNotebookCreate}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="notebook-sidebar-tabs" role="tablist" aria-label="Vista de libretas">
                <button
                  type="button"
                  role="tab"
                  aria-selected={notebookSidebarMode === 'active'}
                  className={`notebook-sidebar-tab${notebookSidebarMode === 'active' ? ' is-active' : ''}`}
                  onClick={() => onNotebookSidebarModeChange('active')}
                >
                  Activas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={notebookSidebarMode === 'archived'}
                  className={`notebook-sidebar-tab${notebookSidebarMode === 'archived' ? ' is-active' : ''}`}
                  onClick={() => onNotebookSidebarModeChange('archived')}
                >
                  Archivadas
                </button>
              </div>
              {sidebarNotebooks.length === 0 ? (
                <div className="notebook-sidebar-empty sidebar-empty-card">
                  <p>
                    {notebookSidebarMode === 'archived'
                      ? 'No hay libretas archivadas.'
                      : 'No hay libretas activas. Crea una nueva o mira en Archivadas.'}
                  </p>
                  {notebookSidebarMode === 'active' ? (
                    <button type="button" onClick={onNotebookCreate}>Crear libreta</button>
                  ) : null}
                </div>
              ) : null}
              {sidebarNotebooks.map((notebook) => {
                const isSelected = notebook.id === selectedNotebookId
                const isExpanded = isSelected && isLibraryNotebookExpanded(notebook.id)
                return (
                  <article key={notebook.id} className={`sidebar-notebook-group${isSelected ? ' active' : ''}`}>
                    <div className={`list-item-shell sidebar-notebook-item${isSelected ? ' active' : ''}`}>
                      <button
                        type="button"
                        className={`list-item row-item${isSelected ? ' active' : ''}`}
                        onClick={() => {
                          onSelectNotebook(notebook.id)
                          onSidebarViewChange('pages')
                        }}
                      >
                        <span className="item-main">
                          <span className="notebook-tree-chevron" aria-hidden="true">
                            {isExpanded ? '▾' : '›'}
                          </span>
                          <span className="item-icon" aria-hidden="true">📒</span>
                          <span>{notebook.title}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="item-menu-button tree-hover-action"
                        aria-label={`Acciones para ${notebook.title}`}
                        onClick={(event) => stopAndRun(event, () => onToggleNotebookMenu(notebook.id))}
                      >
                        ···
                      </button>
                      {notebookMenuId === notebook.id ? (
                        <div className="context-menu" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => onNotebookRename(notebook)}>Renombrar</button>
                          {isNotebookArchived(notebook) ? (
                            <button type="button" onClick={() => onNotebookUnarchive(notebook)}>Desarchivar</button>
                          ) : (
                            <button type="button" onClick={() => onNotebookArchive(notebook)}>Archivar</button>
                          )}
                          <button type="button" onClick={() => onNotebookDelete(notebook)}>Eliminar</button>
                        </div>
                      ) : null}
                    </div>
                    {isExpanded ? (
                      <>
                        <ul className="pages-tree" aria-label={`Páginas de ${notebook.title}`}>
                          {pages.map((page) => (
                            <li key={page.id} className={`page-tree-item list-item-shell${page.id === selectedPageId ? ' active' : ''}`}>
                              <button type="button" className={`page-tree-link${page.id === selectedPageId ? ' active' : ''}`} onClick={() => onSelectPage(page.id)}>
                                <PageTreeTitle
                                  page={page}
                                  isPageBookmarked={isPageBookmarked}
                                  formatPageUpdatedAt={formatPageUpdatedAt}
                                  getPagePreview={getPagePreview}
                                />
                              </button>
                              <button type="button" className="tree-hover-action tree-menu-action" aria-label={`Opciones de ${page.title}`} title="Opciones" onClick={(event) => stopAndRun(event, () => onTogglePageMenu(page.id))}>···</button>
                              {pageMenuId === page.id ? (
                                <div className="context-menu page-context-menu" onClick={(event) => event.stopPropagation()}>
                                  <button type="button" disabled={selectedNotebookReadOnly} onClick={() => onPageBookmark(page)}>
                                    {isPageBookmarked(page) ? 'Quitar favorito' : 'Marcar favorito'}
                                  </button>
                                  <button type="button" disabled={selectedNotebookReadOnly} onClick={onPageMove}>Mover</button>
                                  <button type="button" disabled={selectedNotebookReadOnly} onClick={() => onPageDelete(page)}>Eliminar</button>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        {selectedNotebookReadOnly ? (
                          <p className="notebook-sidebar-empty read-only-note">Archivo de solo lectura.</p>
                        ) : null}
                        {pages.length === 0 ? (
                          <div className="notebook-sidebar-empty sidebar-empty-card">
                            <p>Esta libreta está esperando su primera página.</p>
                            <button type="button" disabled={selectedNotebookReadOnly} onClick={onPageCreate}>Crear primera página</button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </article>
                )
              })}
            </>
          )}
        </>
      )}
    </aside>
  )
}

function PageTreeTitle({
  page,
  isPageBookmarked,
  formatPageUpdatedAt,
  getPagePreview,
}: {
  page: Page
  isPageBookmarked: (page: { tags: string[] }) => boolean
  formatPageUpdatedAt: (ts: number) => string
  getPagePreview: (page: Page) => string
}) {
  const bookmarked = isPageBookmarked(page)
  const preview = getPagePreview(page)
  return (
    <span className="page-tree-label">
      <span className="page-tree-title-row">
        <span
          className={`item-icon page-tree-bookmark-icon${bookmarked ? ' is-visible' : ''}`}
          aria-hidden="true"
          title={bookmarked ? 'Marcada como favorita' : undefined}
        >
          {bookmarked ? '🔖' : ''}
        </span>
        <span className="page-tree-title-text">{page.title}</span>
      </span>
      <span className="page-tree-meta">
        <span>{formatPageUpdatedAt(page.updatedAt)}</span>
        {preview ? <span>{preview}</span> : null}
      </span>
    </span>
  )
}

function stopAndRun(event: MouseEvent<HTMLButtonElement>, callback: () => void) {
  event.stopPropagation()
  callback()
}
