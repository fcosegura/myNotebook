import type { MouseEvent } from 'react'
import type { Space, Page } from '../storage/db'
import { BookmarkIcon, FolderIcon } from './icons'

type BookmarkGroup = {
  space: Space
  pages: Page[]
}

type SidebarProps = {
  spacesHidden: boolean
  spacesCollapsed: boolean
  sidebarPanelMode: 'library' | 'bookmarks'
  sidebarView: 'spaces' | 'pages'
  selectedSpaceId: string | null
  selectedPageId: string | null
  selectedSpace: Space | null
  selectedSpaceReadOnly: boolean
  pages: Page[]
  sidebarSpaces: Space[]
  spaceSidebarMode: 'active' | 'archived'
  bookmarkTree: BookmarkGroup[]
  spaceMenuId: string | null
  pageMenuId: string | null
  onExpandSpaces: () => void
  onCollapseSpaces: () => void
  onSidebarPanelModeChange: (mode: 'library' | 'bookmarks') => void
  onSidebarViewChange: (view: 'spaces' | 'pages') => void
  onSpaceSidebarModeChange: (mode: 'active' | 'archived') => void
  onSpaceCreate: () => void
  onPageCreate: () => void
  onSelectSpace: (spaceId: string) => void
  onSelectPage: (pageId: string) => void
  onToggleSpaceMenu: (spaceId: string) => void
  onTogglePageMenu: (pageId: string) => void
  onSpaceRename: (space: Space) => void
  onSpaceArchive: (space: Space) => void
  onSpaceUnarchive: (space: Space) => void
  onSpaceDelete: (space: Space) => void
  onPageBookmark: (page: Page) => void
  onPageMove: () => void
  onPageDelete: (page: Page) => void
  onBookmarkSpaceToggle: (spaceId: string) => void
  isBookmarkSpaceExpanded: (spaceId: string) => boolean
  isLibrarySpaceExpanded: (spaceId: string) => boolean
  onOpenBookmarkPage: (pageId: string) => void
  isSpaceArchived: (space: Space) => boolean
  isPageBookmarked: (page: { tags: string[] }) => boolean
  formatPageUpdatedAt: (ts: number) => string
  getPagePreview: (page: Page) => string
}

export function Sidebar(props: SidebarProps) {
  const {
    spacesHidden,
    spacesCollapsed,
    sidebarPanelMode,
    selectedSpaceId,
    selectedPageId,
    selectedSpaceReadOnly,
    pages,
    sidebarSpaces,
    spaceSidebarMode,
    bookmarkTree,
    spaceMenuId,
    pageMenuId,
    onExpandSpaces,
    onCollapseSpaces,
    onSidebarPanelModeChange,
    onSidebarViewChange,
    onSpaceSidebarModeChange,
    onSpaceCreate,
    onPageCreate,
    onSelectSpace,
    onSelectPage,
    onToggleSpaceMenu,
    onTogglePageMenu,
    onSpaceRename,
    onSpaceArchive,
    onSpaceUnarchive,
    onSpaceDelete,
    onPageBookmark,
    onPageMove,
    onPageDelete,
    onBookmarkSpaceToggle,
    isBookmarkSpaceExpanded,
    isLibrarySpaceExpanded,
    onOpenBookmarkPage,
    isSpaceArchived,
    isPageBookmarked,
    formatPageUpdatedAt,
    getPagePreview,
  } = props

  if (spacesHidden) {
    return null
  }

  return (
    <aside className={`column spaces master-sidebar${spacesCollapsed ? ' collapsed' : ''}`}>
      {spacesCollapsed ? (
        <button
          type="button"
          className="collapse-toggle collapsed-toggle"
          onClick={onExpandSpaces}
          aria-label="Expandir espacios"
          title="Expandir espacios"
        >
          <span className="collapsed-label">Espacios</span>
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
              title="Espacios y páginas"
              aria-label="Espacios y páginas"
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
            <div className="space-tree bookmarks-tree" aria-label="Favoritos por espacio">
              <h2 className="sidebar-section-label">Favoritos</h2>
              {bookmarkTree.length === 0 ? (
                <div className="space-sidebar-empty sidebar-empty-card">
                  <p>No hay páginas favoritas todavía.</p>
                  <button type="button" onClick={() => onSidebarPanelModeChange('library')}>
                    Volver a espacios
                  </button>
                </div>
              ) : (
                bookmarkTree.map(({ space, pages }) => {
                  const expanded = isBookmarkSpaceExpanded(space.id)
                  return (
                    <div key={space.id} className="bookmark-space-group">
                      <div className="space-tree-header list-item-shell">
                        <button
                          type="button"
                          className="space-tree-folder-btn"
                          aria-expanded={expanded}
                          onClick={() => onBookmarkSpaceToggle(space.id)}
                        >
                          <span className="space-tree-chevron" aria-hidden="true">
                            {expanded ? '▾' : '›'}
                          </span>
                          <span className="item-icon space-folder-icon" aria-hidden="true">
                            📁
                          </span>
                          <span className="space-tree-name">{space.title}</span>
                        </button>
                      </div>
                      {expanded ? (
                        <ul className="pages-tree" aria-label={`Páginas favoritas de ${space.title}`}>
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
                    onClick={onCollapseSpaces}
                    aria-label="Colapsar espacios"
                    title="Colapsar espacios"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <h2>Espacios</h2>
                </div>
                <div className="sidebar-title-actions">
                  <button
                    type="button"
                    className="new-page-action"
                    aria-label="Nueva página"
                    title={selectedSpaceReadOnly ? 'Los espacios archivadas son de solo lectura' : selectedSpaceId ? 'Nueva página' : 'Selecciona un espacio'}
                    disabled={!selectedSpaceId || selectedSpaceReadOnly}
                    onClick={onPageCreate}
                  >
                    + Página
                  </button>
                  <button
                    type="button"
                    className="new-space-action"
                    aria-label="Nuevo espacio"
                    title={spaceSidebarMode === 'archived' ? 'Cambia a Activas para crear un espacio' : 'Nuevo espacio'}
                    disabled={spaceSidebarMode === 'archived'}
                    onClick={onSpaceCreate}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="space-sidebar-tabs" role="tablist" aria-label="Vista de espacios">
                <button
                  type="button"
                  role="tab"
                  aria-selected={spaceSidebarMode === 'active'}
                  className={`space-sidebar-tab${spaceSidebarMode === 'active' ? ' is-active' : ''}`}
                  onClick={() => onSpaceSidebarModeChange('active')}
                >
                  Activas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={spaceSidebarMode === 'archived'}
                  className={`space-sidebar-tab${spaceSidebarMode === 'archived' ? ' is-active' : ''}`}
                  onClick={() => onSpaceSidebarModeChange('archived')}
                >
                  Archivadas
                </button>
              </div>
              {sidebarSpaces.length === 0 ? (
                <div className="space-sidebar-empty sidebar-empty-card">
                  <p>
                    {spaceSidebarMode === 'archived'
                      ? 'No hay espacios archivados.'
                      : 'No hay espacios activas. Crea una nueva o mira en Archivadas.'}
                  </p>
                  {spaceSidebarMode === 'active' ? (
                    <button type="button" onClick={onSpaceCreate}>Crear espacio</button>
                  ) : null}
                </div>
              ) : null}
              {sidebarSpaces.map((space) => {
                const isSelected = space.id === selectedSpaceId
                const isExpanded = isSelected && isLibrarySpaceExpanded(space.id)
                return (
                  <article key={space.id} className={`sidebar-space-group${isSelected ? ' active' : ''}`}>
                    <div className={`list-item-shell sidebar-space-item${isSelected ? ' active' : ''}`}>
                      <button
                        type="button"
                        className={`list-item row-item${isSelected ? ' active' : ''}`}
                        onClick={() => {
                          onSelectSpace(space.id)
                          onSidebarViewChange('pages')
                        }}
                      >
                        <span className="item-main">
                          <span className="space-tree-chevron" aria-hidden="true">
                            {isExpanded ? '▾' : '›'}
                          </span>
                          <span className="item-icon" aria-hidden="true">📒</span>
                          <span>{space.title}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="item-menu-button tree-hover-action"
                        aria-label={`Acciones para ${space.title}`}
                        onClick={(event) => stopAndRun(event, () => onToggleSpaceMenu(space.id))}
                      >
                        ···
                      </button>
                      {spaceMenuId === space.id ? (
                        <div className="context-menu" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => onSpaceRename(space)}>Renombrar</button>
                          {isSpaceArchived(space) ? (
                            <button type="button" onClick={() => onSpaceUnarchive(space)}>Desarchivar</button>
                          ) : (
                            <button type="button" onClick={() => onSpaceArchive(space)}>Archivar</button>
                          )}
                          <button type="button" onClick={() => onSpaceDelete(space)}>Eliminar</button>
                        </div>
                      ) : null}
                    </div>
                    {isExpanded ? (
                      <>
                        <ul className="pages-tree" aria-label={`Páginas de ${space.title}`}>
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
                                  <button type="button" disabled={selectedSpaceReadOnly} onClick={() => onPageBookmark(page)}>
                                    {isPageBookmarked(page) ? 'Quitar favorito' : 'Marcar favorito'}
                                  </button>
                                  <button type="button" disabled={selectedSpaceReadOnly} onClick={onPageMove}>Mover</button>
                                  <button type="button" disabled={selectedSpaceReadOnly} onClick={() => onPageDelete(page)}>Eliminar</button>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        {selectedSpaceReadOnly ? (
                          <p className="space-sidebar-empty read-only-note">Archivo de solo lectura.</p>
                        ) : null}
                        {pages.length === 0 ? (
                          <div className="space-sidebar-empty sidebar-empty-card">
                            <p>Este espacio está esperando su primera página.</p>
                            <button type="button" disabled={selectedSpaceReadOnly} onClick={onPageCreate}>Crear primera página</button>
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
        {preview || formatPageUpdatedAt(page.updatedAt)}
      </span>
    </span>
  )
}

function stopAndRun(event: MouseEvent<HTMLButtonElement>, callback: () => void) {
  event.stopPropagation()
  callback()
}
