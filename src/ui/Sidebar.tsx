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
  onOpenBookmarkPage: (pageId: string) => void
  isNotebookArchived: (notebook: Notebook) => boolean
  isPageBookmarked: (page: { tags: string[] }) => boolean
}

export function Sidebar(props: SidebarProps) {
  const {
    notebooksHidden,
    notebooksCollapsed,
    sidebarPanelMode,
    sidebarView,
    selectedNotebookId,
    selectedPageId,
    selectedNotebook,
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
    onOpenBookmarkPage,
    isNotebookArchived,
    isPageBookmarked,
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
              title="Libretas y paginas"
              aria-label="Libretas y paginas"
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
                <p className="notebook-sidebar-empty">No hay paginas con bookmark.</p>
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
                        <ul className="pages-tree" aria-label={`Paginas favoritas de ${notebook.title}`}>
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
                                <PageTreeTitle page={page} isPageBookmarked={isPageBookmarked} />
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
          ) : sidebarView === 'pages' && selectedNotebookId ? (
            <>
              <button type="button" className="sidebar-back-button" onClick={() => onSidebarViewChange('notebooks')}>
                <span aria-hidden="true">‹</span> Libretas
              </button>
              <div className="notebook-tree">
                <div className="notebook-tree-header list-item-shell">
                  <span className="notebook-tree-folder">
                    <span className="item-icon notebook-folder-icon" aria-hidden="true">📁</span>
                    <span className="notebook-tree-name">{selectedNotebook?.title ?? 'Libreta'}</span>
                  </span>
                  <button type="button" className="tree-hover-action new-page-action" aria-label="Nueva pagina" title="Nueva pagina" onClick={onPageCreate}>+</button>
                </div>
                <ul className="pages-tree" aria-label="Paginas de la libreta">
                  {pages.map((page) => (
                    <li key={page.id} className={`page-tree-item list-item-shell${page.id === selectedPageId ? ' active' : ''}`}>
                      <button type="button" className={`page-tree-link${page.id === selectedPageId ? ' active' : ''}`} onClick={() => onSelectPage(page.id)}>
                        <PageTreeTitle page={page} isPageBookmarked={isPageBookmarked} />
                      </button>
                      <button type="button" className="tree-hover-action tree-menu-action" aria-label={`Opciones de ${page.title}`} title="Opciones" onClick={(event) => stopAndRun(event, () => onTogglePageMenu(page.id))}>···</button>
                      {pageMenuId === page.id ? (
                        <div className="context-menu page-context-menu" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => onPageBookmark(page)}>Bookmark</button>
                          <button type="button" onClick={onPageMove}>Mover</button>
                          <button type="button" onClick={() => onPageDelete(page)}>Eliminar</button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {pages.length === 0 ? <p className="notebook-sidebar-empty">Sin paginas. Usa + para crear una.</p> : null}
              </div>
            </>
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
                <button type="button" className="new-notebook-action" aria-label="Nueva libreta" title="Nueva libreta" onClick={onNotebookCreate}>+</button>
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
                <p className="notebook-sidebar-empty">
                  {notebookSidebarMode === 'archived'
                    ? 'No hay libretas archivadas.'
                    : 'No hay libretas activas. Crea una nueva o mira en Archivadas.'}
                </p>
              ) : null}
              {sidebarNotebooks.map((notebook) => (
                <article key={notebook.id} className={`list-item-shell sidebar-notebook-item${notebook.id === selectedNotebookId ? ' active' : ''}`}>
                  <button
                    type="button"
                    className={`list-item row-item${notebook.id === selectedNotebookId ? ' active' : ''}`}
                    onClick={() => onSelectNotebook(notebook.id)}
                  >
                    <span className="item-main">
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
                </article>
              ))}
            </>
          )}
        </>
      )}
    </aside>
  )
}

function PageTreeTitle({ page, isPageBookmarked }: { page: Page; isPageBookmarked: (page: { tags: string[] }) => boolean }) {
  const bookmarked = isPageBookmarked(page)
  return (
    <span className="page-tree-label">
      {bookmarked ? (
        <span className="item-icon page-tree-bookmark-icon" aria-hidden="true" title="Marcada como favorita">
          🔖
        </span>
      ) : null}
      <span className="page-tree-title-text">{page.title}</span>
    </span>
  )
}

function stopAndRun(event: MouseEvent<HTMLButtonElement>, callback: () => void) {
  event.stopPropagation()
  callback()
}
