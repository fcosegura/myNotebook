import { useRef, useState } from 'react'

export type SidebarView = 'notebooks' | 'pages'
export type SidebarPanelMode = 'library' | 'bookmarks'
export type NotebookSidebarMode = 'active' | 'archived'

export function useSidebarState() {
  const [notebooksHidden, setNotebooksHidden] = useState(false)
  const [notebookMenuId, setNotebookMenuId] = useState<string | null>(null)
  const [pageMenuId, setPageMenuId] = useState<string | null>(null)
  const [sidebarView, setSidebarView] = useState<SidebarView>('notebooks')
  const [sidebarPanelMode, setSidebarPanelMode] = useState<SidebarPanelMode>('library')
  const [bookmarkNotebooksCollapsed, setBookmarkNotebooksCollapsed] = useState<Set<string>>(new Set())
  const [notebookSidebarMode, setNotebookSidebarMode] = useState<NotebookSidebarMode>('active')
  const notebookSidebarModeRef = useRef<NotebookSidebarMode>('active')
  const [notebooksCollapsed, setNotebooksCollapsed] = useState(false)

  function toggleBookmarkNotebookExpanded(notebookId: string) {
    setBookmarkNotebooksCollapsed((current) => {
      const next = new Set(current)
      if (next.has(notebookId)) {
        next.delete(notebookId)
      } else {
        next.add(notebookId)
      }
      return next
    })
  }

  function isBookmarkNotebookExpanded(notebookId: string) {
    return !bookmarkNotebooksCollapsed.has(notebookId)
  }

  function setNotebookSidebarModeSynced(mode: NotebookSidebarMode) {
    setNotebookSidebarMode(mode)
    notebookSidebarModeRef.current = mode
  }

  return {
    notebooksHidden,
    notebookMenuId,
    pageMenuId,
    sidebarView,
    sidebarPanelMode,
    bookmarkNotebooksCollapsed,
    notebookSidebarMode,
    notebookSidebarModeRef,
    notebooksCollapsed,
    setNotebooksHidden,
    setNotebookMenuId,
    setPageMenuId,
    setSidebarView,
    setSidebarPanelMode,
    setNotebookSidebarMode: setNotebookSidebarModeSynced,
    setNotebooksCollapsed,
    toggleBookmarkNotebookExpanded,
    isBookmarkNotebookExpanded,
  }
}
