import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { Space, Page } from '../storage/db'
import { BookmarkIcon, ChevronIcon, FileIcon, FolderIcon, SearchIcon } from './icons'

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
  onImport: () => void
  onSelectSpace: (spaceId: string) => void
  onToggleSpaceExpanded: (spaceId: string) => void
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
    onImport,
    onSelectSpace,
    onToggleSpaceExpanded,
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
  } = props

  const [filterTerm, setFilterTerm] = useState('')
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const nuevoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!nuevoOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (nuevoRef.current && !nuevoRef.current.contains(event.target as Node)) {
        setNuevoOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNuevoOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [nuevoOpen])

  const normalizedFilter = filterTerm.trim().toLocaleLowerCase('es')

  const filteredSpaces = useMemo(() => {
    if (!normalizedFilter) {
      return sidebarSpaces
    }
    return sidebarSpaces.filter((space) => space.title.toLocaleLowerCase('es').includes(normalizedFilter))
  }, [sidebarSpaces, normalizedFilter])

  const filteredPages = useMemo(() => {
    if (!normalizedFilter) {
      return pages
    }
    return pages.filter((page) => page.title.toLocaleLowerCase('es').includes(normalizedFilter))
  }, [pages, normalizedFilter])

  const filteredBookmarkTree = useMemo(() => {
    if (!normalizedFilter) {
      return bookmarkTree
    }
    return bookmarkTree
      .map(({ space, pages: groupPages }) => {
        const spaceMatch = space.title.toLocaleLowerCase('es').includes(normalizedFilter)
        const matchedPages = groupPages.filter((page) =>
          page.title.toLocaleLowerCase('es').includes(normalizedFilter),
        )
        if (!spaceMatch && matchedPages.length === 0) {
          return null
        }
        return { space, pages: spaceMatch ? groupPages : matchedPages }
      })
      .filter((group): group is BookmarkGroup => group !== null)
  }, [bookmarkTree, normalizedFilter])

  if (spacesHidden) {
    return null
  }

  const canCreateSpace = spaceSidebarMode !== 'archived'
  const canCreatePage = Boolean(selectedSpaceId) && !selectedSpaceReadOnly

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
          <div className="sidebar-sticky">
            <div className="sidebar-header">
              <div className="sidebar-header-row">
                <button
                  type="button"
                  className="collapse-toggle sidebar-collapse-btn"
                  onClick={onCollapseSpaces}
                  aria-label="Colapsar espacios"
                  title="Colapsar espacios"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <h2 className="sidebar-title">Espacios</h2>
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
              </div>

              <label className="sidebar-search" aria-label="Filtrar espacios y páginas">
                <span className="sidebar-search-icon" aria-hidden="true">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  className="sidebar-search-input"
                  placeholder="Buscar…"
                  value={filterTerm}
                  onChange={(event) => setFilterTerm(event.target.value)}
                />
              </label>

              <div className="sidebar-toolbar">
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

                <div className="nuevo-menu" ref={nuevoRef}>
                  <button
                    type="button"
                    className={`nuevo-btn${nuevoOpen ? ' is-open' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={nuevoOpen}
                    onClick={() => setNuevoOpen((open) => !open)}
                  >
                    Nuevo
                    <span className="nuevo-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {nuevoOpen ? (
                    <div className="nuevo-dropdown" role="menu" aria-label="Crear o importar">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!canCreateSpace}
                        title={canCreateSpace ? undefined : 'Cambia a Activas para crear un espacio'}
                        onClick={() => {
                          setNuevoOpen(false)
                          onSpaceCreate()
                        }}
                      >
                        Nuevo espacio
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!canCreatePage}
                        title={
                          canCreatePage
                            ? undefined
                            : selectedSpaceReadOnly
                              ? 'Los espacios archivados son de solo lectura'
                              : 'Selecciona un espacio'
                        }
                        onClick={() => {
                          setNuevoOpen(false)
                          onPageCreate()
                        }}
                      >
                        Nueva página
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setNuevoOpen(false)
                          onImport()
                        }}
                      >
                        Importar
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {sidebarPanelMode === 'bookmarks' ? (
            <div className="explorer-tree bookmarks-tree" aria-label="Favoritos por espacio">
              <p className="explorer-section-label">Favoritos</p>
              {filteredBookmarkTree.length === 0 ? (
                <div className="explorer-empty">
                  <p>{normalizedFilter ? 'Sin resultados.' : 'No hay páginas favoritas todavía.'}</p>
                  {!normalizedFilter ? (
                    <button type="button" onClick={() => onSidebarPanelModeChange('library')}>
                      Volver a espacios
                    </button>
                  ) : null}
                </div>
              ) : (
                filteredBookmarkTree.map(({ space, pages: groupPages }) => {
                  const expanded = isBookmarkSpaceExpanded(space.id) || Boolean(normalizedFilter)
                  return (
                    <ExplorerFolder
                      key={space.id}
                      title={space.title}
                      expanded={expanded}
                      selected={false}
                      onToggle={() => onBookmarkSpaceToggle(space.id)}
                      onSelect={() => onBookmarkSpaceToggle(space.id)}
                    >
                      {groupPages.map((page) => (
                        <ExplorerFile
                          key={page.id}
                          title={page.title}
                          selected={page.id === selectedPageId}
                          bookmarked
                          onSelect={() => onOpenBookmarkPage(page.id)}
                        />
                      ))}
                    </ExplorerFolder>
                  )
                })
              )}
            </div>
          ) : (
            <div className="explorer-tree space-tree" aria-label="Explorador de espacios">
              {filteredSpaces.length === 0 ? (
                <div className="explorer-empty">
                  <p>
                    {normalizedFilter
                      ? 'Sin resultados.'
                      : spaceSidebarMode === 'archived'
                        ? 'No hay espacios archivados.'
                        : 'No hay espacios activos. Crea uno nuevo o mira en Archivadas.'}
                  </p>
                  {!normalizedFilter && spaceSidebarMode === 'active' ? (
                    <button type="button" onClick={onSpaceCreate}>
                      Crear espacio
                    </button>
                  ) : null}
                </div>
              ) : (
                filteredSpaces.map((space) => {
                  const isSelected = space.id === selectedSpaceId
                  const isExpanded =
                    (isSelected && isLibrarySpaceExpanded(space.id)) ||
                    (Boolean(normalizedFilter) && isSelected)
                  const spaceMatchesFilter =
                    Boolean(normalizedFilter) &&
                    space.title.toLocaleLowerCase('es').includes(normalizedFilter)
                  const visiblePages = !isSelected
                    ? []
                    : !normalizedFilter || spaceMatchesFilter
                      ? pages
                      : filteredPages

                  return (
                    <ExplorerFolder
                      key={space.id}
                      title={space.title}
                      expanded={isExpanded}
                      selected={isSelected && !selectedPageId}
                      menuOpen={spaceMenuId === space.id}
                      onToggle={() => {
                        if (isSelected) {
                          onToggleSpaceExpanded(space.id)
                        } else {
                          onSelectSpace(space.id)
                          onSidebarViewChange('pages')
                        }
                      }}
                      onSelect={() => {
                        onSelectSpace(space.id)
                        onSidebarViewChange('pages')
                      }}
                      onMenuToggle={(event) => stopAndRun(event, () => onToggleSpaceMenu(space.id))}
                      menu={
                        spaceMenuId === space.id ? (
                          <div className="context-menu" onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={() => onSpaceRename(space)}>
                              Renombrar
                            </button>
                            {isSpaceArchived(space) ? (
                              <button type="button" onClick={() => onSpaceUnarchive(space)}>
                                Desarchivar
                              </button>
                            ) : (
                              <button type="button" onClick={() => onSpaceArchive(space)}>
                                Archivar
                              </button>
                            )}
                            <button type="button" onClick={() => onSpaceDelete(space)}>
                              Eliminar
                            </button>
                          </div>
                        ) : null
                      }
                    >
                      {isExpanded ? (
                        <>
                          {visiblePages.map((page) => (
                            <ExplorerFile
                              key={page.id}
                              title={page.title}
                              selected={page.id === selectedPageId}
                              bookmarked={isPageBookmarked(page)}
                              menuOpen={pageMenuId === page.id}
                              onSelect={() => onSelectPage(page.id)}
                              onMenuToggle={(event) => stopAndRun(event, () => onTogglePageMenu(page.id))}
                              menu={
                                pageMenuId === page.id ? (
                                  <div
                                    className="context-menu page-context-menu"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      disabled={selectedSpaceReadOnly}
                                      onClick={() => onPageBookmark(page)}
                                    >
                                      {isPageBookmarked(page) ? 'Quitar favorito' : 'Marcar favorito'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={selectedSpaceReadOnly}
                                      onClick={onPageMove}
                                    >
                                      Mover
                                    </button>
                                    <button
                                      type="button"
                                      disabled={selectedSpaceReadOnly}
                                      onClick={() => onPageDelete(page)}
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                ) : null
                              }
                            />
                          ))}
                          {selectedSpaceReadOnly ? (
                            <p className="explorer-note">Archivo de solo lectura.</p>
                          ) : null}
                          {visiblePages.length === 0 && !normalizedFilter ? (
                            <div className="explorer-empty explorer-empty-nested">
                              <p>Este espacio está esperando su primera página.</p>
                              <button type="button" disabled={selectedSpaceReadOnly} onClick={onPageCreate}>
                                Crear primera página
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </ExplorerFolder>
                  )
                })
              )}
            </div>
          )}
        </>
      )}
    </aside>
  )
}

function ExplorerFolder({
  title,
  expanded,
  selected,
  menuOpen,
  onToggle,
  onSelect,
  onMenuToggle,
  menu,
  children,
}: {
  title: string
  expanded: boolean
  selected: boolean
  menuOpen?: boolean
  onToggle: () => void
  onSelect: () => void
  onMenuToggle?: (event: MouseEvent<HTMLButtonElement>) => void
  menu?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={`explorer-folder${expanded ? ' is-expanded' : ''}${selected ? ' is-selected' : ''}`}>
      <div className={`explorer-row explorer-folder-row${selected ? ' is-selected' : ''}${menuOpen ? ' has-menu' : ''}`}>
        <button
          type="button"
          className="explorer-chevron-btn"
          aria-expanded={expanded}
          aria-label={expanded ? `Colapsar ${title}` : `Expandir ${title}`}
          onClick={onToggle}
        >
          <ChevronIcon expanded={expanded} />
        </button>
        <button type="button" className="explorer-row-main" onClick={onSelect}>
          <span className="explorer-icon" aria-hidden="true">
            <FolderIcon />
          </span>
          <span className="explorer-label">{title}</span>
        </button>
        {onMenuToggle ? (
          <button
            type="button"
            className="explorer-row-action"
            aria-label={`Acciones para ${title}`}
            onClick={onMenuToggle}
          >
            ···
          </button>
        ) : null}
        {menu}
      </div>
      <div className={`explorer-children${expanded ? ' is-open' : ''}`} aria-hidden={!expanded}>
        {children}
      </div>
    </div>
  )
}

function ExplorerFile({
  title,
  selected,
  bookmarked,
  menuOpen,
  onSelect,
  onMenuToggle,
  menu,
}: {
  title: string
  selected: boolean
  bookmarked?: boolean
  menuOpen?: boolean
  onSelect: () => void
  onMenuToggle?: (event: MouseEvent<HTMLButtonElement>) => void
  menu?: ReactNode
}) {
  return (
    <div className={`explorer-row explorer-file-row${selected ? ' is-selected' : ''}${menuOpen ? ' has-menu' : ''}`}>
      <button type="button" className="explorer-row-main" onClick={onSelect}>
        <span className="explorer-icon" aria-hidden="true">
          <FileIcon />
        </span>
        <span className="explorer-label">{title}</span>
        {bookmarked ? (
          <span className="explorer-bookmark-dot" title="Favorita" aria-label="Favorita" />
        ) : null}
      </button>
      {onMenuToggle ? (
        <button
          type="button"
          className="explorer-row-action"
          aria-label={`Opciones de ${title}`}
          title="Opciones"
          onClick={onMenuToggle}
        >
          ···
        </button>
      ) : null}
      {menu}
    </div>
  )
}

function stopAndRun(event: MouseEvent<HTMLButtonElement>, callback: () => void) {
  event.stopPropagation()
  callback()
}
