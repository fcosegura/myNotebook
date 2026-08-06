import { useRef, useState } from 'react'

export type SidebarView = 'spaces' | 'pages'
export type SidebarPanelMode = 'library' | 'bookmarks'
export type SpaceSidebarMode = 'active' | 'archived'

export function useSidebarState() {
  const [spacesHidden, setSpacesHidden] = useState(false)
  const [spaceMenuId, setSpaceMenuId] = useState<string | null>(null)
  const [pageMenuId, setPageMenuId] = useState<string | null>(null)
  const [sidebarView, setSidebarView] = useState<SidebarView>('spaces')
  const [sidebarPanelMode, setSidebarPanelMode] = useState<SidebarPanelMode>('library')
  const [bookmarkSpacesCollapsed, setBookmarkSpacesCollapsed] = useState<Set<string>>(new Set())
  const [librarySpacesCollapsed, setLibrarySpacesCollapsed] = useState<Set<string>>(new Set())
  const [spaceSidebarMode, setSpaceSidebarMode] = useState<SpaceSidebarMode>('active')
  const spaceSidebarModeRef = useRef<SpaceSidebarMode>('active')
  const [spacesCollapsed, setSpacesCollapsed] = useState(false)

  function toggleBookmarkSpaceExpanded(spaceId: string) {
    setBookmarkSpacesCollapsed((current) => {
      const next = new Set(current)
      if (next.has(spaceId)) {
        next.delete(spaceId)
      } else {
        next.add(spaceId)
      }
      return next
    })
  }

  function isBookmarkSpaceExpanded(spaceId: string) {
    return !bookmarkSpacesCollapsed.has(spaceId)
  }

  function toggleLibrarySpaceExpanded(spaceId: string) {
    setLibrarySpacesCollapsed((current) => {
      const next = new Set(current)
      if (next.has(spaceId)) {
        next.delete(spaceId)
      } else {
        next.add(spaceId)
      }
      return next
    })
  }

  function isLibrarySpaceExpanded(spaceId: string) {
    return !librarySpacesCollapsed.has(spaceId)
  }

  function setLibrarySpaceExpanded(spaceId: string, expanded: boolean) {
    setLibrarySpacesCollapsed((current) => {
      const next = new Set(current)
      if (expanded) {
        next.delete(spaceId)
      } else {
        next.add(spaceId)
      }
      return next
    })
  }

  function setSpaceSidebarModeSynced(mode: SpaceSidebarMode) {
    setSpaceSidebarMode(mode)
    spaceSidebarModeRef.current = mode
  }

  return {
    spacesHidden,
    spaceMenuId,
    pageMenuId,
    sidebarView,
    sidebarPanelMode,
    bookmarkSpacesCollapsed,
    librarySpacesCollapsed,
    spaceSidebarMode,
    spaceSidebarModeRef,
    spacesCollapsed,
    setSpacesHidden,
    setSpaceMenuId,
    setPageMenuId,
    setSidebarView,
    setSidebarPanelMode,
    setSpaceSidebarMode: setSpaceSidebarModeSynced,
    setSpacesCollapsed,
    toggleBookmarkSpaceExpanded,
    isBookmarkSpaceExpanded,
    toggleLibrarySpaceExpanded,
    isLibrarySpaceExpanded,
    setLibrarySpaceExpanded,
  }
}

