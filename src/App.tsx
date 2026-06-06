import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type MouseEvent,
} from 'react'
import './App.css'
import type MiniSearch from 'minisearch'
import type { Attachment, Notebook, Page, UserLocal } from './storage/db'
import { parseEncryptedBackup, serializeEncryptedBackup } from './features/backup/crypto'
import {
  addAttachment,
  createNotebook,
  createPage,
  deleteNotebook,
  deletePage,
  deleteAttachment,
  ensureUser,
  exportBackupPayload,
  importBackupPayload,
  importBackupPayloadWithMode,
  encryptExistingDataAtRest,
  rotateEncryptionPin,
  getPageById,
  listAttachmentsByPage,
  listAllAttachments,
  listAllPages,
  listNotebooks,
  listPagesByNotebook,
  movePageBefore,
  updateNotebook,
  updatePage,
  updateUser,
} from './storage/repository'
import { buildSearchIndex, querySearch, type SearchResult } from './features/search/search'
import { createSalt, hashPin } from './features/session/session'
import { lockVault, unlockVaultWithPin } from './features/session/vault'
import {
  BookmarkIcon,
  CloudSaveIcon,
  FolderIcon,
  HeaderMenuIcon,
  ListBulletIcon,
  ListNumberIcon,
  NotebookEmptyIcon,
  PageEmptyIcon,
  QuoteIcon,
  RedoIcon,
  UndoIcon,
} from './ui/icons'
import {
  appendImageReferenceToContent,
  blockquoteContainingRange,
  insertCaretMarkerBeforeCollapsed,
  insertImagePasteMarker,
  insertImageReferenceAtPasteMarker,
  linkifyEditorAutoLinksPreservingCaret,
  restoreCaretAtMarker,
  unwrapBlockquoteElement,
} from './ui/editorRichText'

const BOOKMARK_TAG = 'bookmark'
const INACTIVITY_AUTO_LOCK_MS = 30 * 60 * 1000
const TEXT_COLOR_PALETTE = [
  '#f87171', '#fb923c', '#facc15', '#4ade80', '#60a5fa',
  '#2563eb', '#c084fc', '#f472b6', '#fdba74',
]
const FONT_SIZE_STEPS_PX = [12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32] as const
const MAX_PIN_DIGITS = 32

function isNotebookArchived(notebook: Notebook): boolean {
  return notebook.archived === true
}

function isPageBookmarked(page: { tags: string[] }): boolean {
  return page.tags.includes(BOOKMARK_TAG)
}

function PageTreeTitle({ page }: { page: Page }) {
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

function formatLastSavedDisplay(ts: number): string {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(ts))
}

function App() {
  const [user, setUser] = useState<UserLocal | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [unlockAttempts, setUnlockAttempts] = useState(0)
  const [unlockBlockedUntil, setUnlockBlockedUntil] = useState(0)
  const inactivityTimerRef = useRef<number | null>(null)
  const submitLockScreenRef = useRef<() => void>(() => {})

  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [pages, setPages] = useState<Page[]>([])
  const [allPages, setAllPages] = useState<Page[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])

  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [pastingImage, setPastingImage] = useState(false)
  const [forceSavePending, setForceSavePending] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)
  const [backupStatus, setBackupStatus] = useState('')
  const [backupStatusType, setBackupStatusType] = useState<'success' | 'error' | 'info'>('info')
  const [secretDialog, setSecretDialog] = useState<{ title: string; confirmLabel: string } | null>(null)
  const [secretInput, setSecretInput] = useState('')
  const [secretVisible, setSecretVisible] = useState(false)
  const [appDialog, setAppDialog] = useState<AppDialogState | null>(null)
  const [appDialogInput, setAppDialogInput] = useState('')
  const [movePageDialogOpen, setMovePageDialogOpen] = useState(false)
  const [moveBeforePageId, setMoveBeforePageId] = useState<string>('')
  const [actionsOpen, setActionsOpen] = useState(false)
  const [formatMenuOpen, setFormatMenuOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [notebooksHidden, setNotebooksHidden] = useState(false)
  const [notebookMenuId, setNotebookMenuId] = useState<string | null>(null)
  const [pageMenuId, setPageMenuId] = useState<string | null>(null)
  const [sidebarView, setSidebarView] = useState<'notebooks' | 'pages'>('notebooks')
  const [sidebarPanelMode, setSidebarPanelMode] = useState<'library' | 'bookmarks'>('library')
  const [bookmarkNotebooksCollapsed, setBookmarkNotebooksCollapsed] = useState<Set<string>>(new Set())
  const [notebookSidebarMode, setNotebookSidebarMode] = useState<'active' | 'archived'>('active')
  const notebookSidebarModeRef = useRef<'active' | 'archived'>('active')
  const [imageModalAttachment, setImageModalAttachment] = useState<Attachment | null>(null)
  const imageModalUrl = useMemo(() => {
    if (!imageModalAttachment) {
      return null
    }
    return URL.createObjectURL(imageModalAttachment.blob)
  }, [imageModalAttachment])
  const secretResolverRef = useRef<((value: string | null) => void) | null>(null)
  const appDialogResolverRef = useRef<((value: unknown) => void) | null>(null)

  const [notebooksCollapsed, setNotebooksCollapsed] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const editorTitleRef = useRef<HTMLInputElement | null>(null)
  const forceSaveNoteRef = useRef<() => Promise<void>>(async () => {})
  const lastSyncedEditorHtmlRef = useRef<string>('')
  /** Evita pisar el DOM del editor con `selectedPage` desactualizado al re-renderizar la misma pagina. */
  const editorBoundPageIdRef = useRef<string | null>(null)
  const selectedNotebookIdRef = useRef<string | null>(null)
  const pagePersistChainRef = useRef(Promise.resolve())

  useEffect(() => {
    void bootstrap()
  }, [])

  useEffect(() => {
    selectedNotebookIdRef.current = selectedNotebookId
  }, [selectedNotebookId])

  useEffect(() => {
    notebookSidebarModeRef.current = notebookSidebarMode
  }, [notebookSidebarMode])

  function markDataSaved() {
    setLastSavedAt(Date.now())
  }

  useEffect(() => {
    function handleGlobalClick() {
      setNotebookMenuId(null)
      setPageMenuId(null)
      setFormatMenuOpen(false)
    }
    window.addEventListener('click', handleGlobalClick)
    return () => {
      window.removeEventListener('click', handleGlobalClick)
    }
  }, [])

  useEffect(() => {
    if (!imageModalUrl) {
      return
    }
    return () => {
      URL.revokeObjectURL(imageModalUrl)
    }
  }, [imageModalUrl])

  useEffect(() => {
    if (!unlocked) {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      return
    }

    const scheduleAutoLock = () => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
      }
      inactivityTimerRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            await forceSaveNoteRef.current()
            await pagePersistChainRef.current
          } catch (error) {
            console.error('Auto-lock: guardado previo fallo:', error)
          }
          lockVault()
          setUnlocked(false)
          setPinInput('')
          setPinError('Sesion bloqueada por inactividad. Ingresa tu PIN.')
        })()
      }, INACTIVITY_AUTO_LOCK_MS)
    }

    const handleActivity = () => {
      scheduleAutoLock()
    }

    scheduleAutoLock()

    window.addEventListener('pointerdown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('touchstart', handleActivity, { passive: true })
    window.addEventListener('scroll', handleActivity, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
      window.removeEventListener('scroll', handleActivity)
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
    }
  }, [unlocked])

  const selectedNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === selectedNotebookId) ?? null,
    [notebooks, selectedNotebookId],
  )

  const sidebarNotebooks = useMemo(
    () =>
      notebooks.filter((notebook) =>
        notebookSidebarMode === 'archived' ? isNotebookArchived(notebook) : !isNotebookArchived(notebook),
      ),
    [notebooks, notebookSidebarMode],
  )

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, selectedPageId],
  )

  useEffect(() => {
    if (!unlocked) {
      editorBoundPageIdRef.current = null
      return
    }
    if (!selectedPage || !editorRef.current) {
      editorBoundPageIdRef.current = null
      return
    }
    const el = editorRef.current
    const incoming = selectedPage.content || ''
    const navigatedToDifferentPage = editorBoundPageIdRef.current !== selectedPage.id
    editorBoundPageIdRef.current = selectedPage.id

    if (navigatedToDifferentPage) {
      el.innerHTML = incoming
      lastSyncedEditorHtmlRef.current = incoming
    }

    linkifyEditorAutoLinksPreservingCaret(el)
    const html = el.innerHTML
    if (html !== lastSyncedEditorHtmlRef.current) {
      lastSyncedEditorHtmlRef.current = html
      void handlePageFieldChange('content', html)
    }
    // handlePageFieldChange excluido: nueva identidad cada render provocaria bucles de persistencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPage, unlocked])

  const selectedPageAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.pageId === selectedPageId),
    [attachments, selectedPageId],
  )

  const isCurrentPageBookmarked = Boolean(selectedPage?.tags.includes(BOOKMARK_TAG))

  const bookmarkTree = useMemo(() => {
    const notebookById = new Map(notebooks.map((notebook) => [notebook.id, notebook]))
    const grouped = new Map<string, { notebook: Notebook; pages: Page[] }>()

    for (const page of allPages) {
      if (!isPageBookmarked(page)) {
        continue
      }
      const notebook = notebookById.get(page.notebookId)
      if (!notebook) {
        continue
      }
      const entry = grouped.get(notebook.id) ?? { notebook, pages: [] }
      entry.pages.push(page)
      grouped.set(notebook.id, entry)
    }

    return Array.from(grouped.values())
      .map(({ notebook, pages }) => ({
        notebook,
        pages: pages.sort((a, b) => a.title.localeCompare(b.title, 'es')),
      }))
      .sort((a, b) => a.notebook.title.localeCompare(b.notebook.title, 'es'))
  }, [allPages, notebooks])

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

  async function refreshAllPages() {
    setAllPages(await listAllPages())
  }

  async function bootstrap() {
    lockVault()
    const localUser = await ensureUser()
    setUser(localUser)
    // Always show lock/setup screen on app entry.
    setUnlocked(false)
  }

  async function clearWorkspaceWithoutNotebook() {
    setSelectedPageId(null)
    setPages([])
    setAttachments(await listAllAttachments())
    await refreshAllPages()
  }

  async function refreshNotebooks(options?: { preferNotebookId?: string | null }) {
    const allNotebooks = await listNotebooks()
    setNotebooks(allNotebooks)

    if (allNotebooks.length === 0) {
      const notebook = await createNotebook('Mi libreta')
      markDataSaved()
      notebookSidebarModeRef.current = 'active'
      setNotebookSidebarMode('active')
      const refreshed = await listNotebooks()
      setNotebooks(refreshed)
      setSelectedNotebookId(notebook.id)
      await refreshPages(notebook.id)
      return
    }

    const mode = notebookSidebarModeRef.current
    const pool = allNotebooks.filter((notebook) =>
      mode === 'archived' ? isNotebookArchived(notebook) : !isNotebookArchived(notebook),
    )

    const preferred = options?.preferNotebookId
    const preferredInPool = preferred && pool.some((notebook) => notebook.id === preferred)

    const keepSelection =
      selectedNotebookId &&
      allNotebooks.some((notebook) => notebook.id === selectedNotebookId) &&
      pool.some((notebook) => notebook.id === selectedNotebookId)

    const notebookId = preferredInPool
      ? preferred!
      : keepSelection
        ? selectedNotebookId!
        : pool[0]?.id ?? null

    setSelectedNotebookId(notebookId)
    if (notebookId) {
      await refreshPages(notebookId)
    } else {
      await clearWorkspaceWithoutNotebook()
    }
    await refreshAllPages()
  }

  async function refreshPages(notebookId: string) {
    const allPages = await listPagesByNotebook(notebookId)
    setPages(allPages)
    const allAttachments = await listAllAttachments()
    setAttachments(allAttachments)

    const nextPageId = selectedPageId && allPages.some((page) => page.id === selectedPageId)
      ? selectedPageId
      : allPages[0]?.id ?? null
    setSelectedPageId(nextPageId)
  }

  async function handleNotebookCreate() {
    const notebookName = await requestTextDialog({
      title: 'Nueva libreta',
      message: 'Elige un nombre para la libreta.',
      confirmLabel: 'Crear',
      placeholder: 'Nombre de la libreta',
    })
    if (notebookName === null) {
      return
    }

    const notebook = await createNotebook(notebookName)
    notebookSidebarModeRef.current = 'active'
    setNotebookSidebarMode('active')
    await refreshNotebooks({ preferNotebookId: notebook.id })
    markDataSaved()
  }

  async function handlePageCreate() {
    if (!selectedNotebookId) {
      return
    }

    const pageName = await requestTextDialog({
      title: 'Nueva pagina',
      message: 'Escribe el nombre de la pagina.',
      confirmLabel: 'Crear',
      placeholder: 'Nombre de la pagina',
    })
    if (pageName === null) {
      return
    }

    const page = await createPage(selectedNotebookId, pageName)
    await refreshPages(selectedNotebookId)
    setSelectedPageId(page.id)
    markDataSaved()
  }

  function enqueuePagePersist(task: () => Promise<void>): Promise<void> {
    const prev = pagePersistChainRef.current
    const next = prev.then(task).catch((error) => {
      console.error('Persist page failed:', error)
    })
    pagePersistChainRef.current = next
    return next
  }

  async function handlePageBookmark(page?: Page) {
    const current = page ?? selectedPage
    if (!current) {
      return
    }
    const pageId = current.id
    await enqueuePagePersist(async () => {
      const fresh = await getPageById(pageId)
      if (!fresh) {
        return
      }
      const hasBookmark = fresh.tags.includes(BOOKMARK_TAG)
      const updatedTags = hasBookmark
        ? fresh.tags.filter((tag) => tag !== BOOKMARK_TAG)
        : [...fresh.tags, BOOKMARK_TAG]
      await updatePage({ ...fresh, tags: updatedTags }, { touchUpdatedAt: false })
      markDataSaved()
      await refreshAllPages()
      if (selectedNotebookIdRef.current === fresh.notebookId) {
        await refreshPages(fresh.notebookId)
      }
    })
    setPageMenuId(null)
  }

  async function handleNotebookRename(notebook?: Notebook) {
    const current = notebook ?? selectedNotebook
    if (!current) {
      return
    }
    const nextName = await requestTextDialog({
      title: 'Renombrar libreta',
      message: 'Actualiza el nombre de la libreta.',
      confirmLabel: 'Guardar',
      placeholder: 'Nuevo nombre',
      initialValue: current.title,
    })
    if (nextName === null) {
      return
    }
    const updated = { ...current, title: nextName.trim() || 'Nueva libreta' }
    await updateNotebook(updated)
    await refreshNotebooks()
    markDataSaved()
  }

  async function handleNotebookDelete(notebook?: Notebook) {
    const current = notebook ?? selectedNotebook
    if (!current) {
      return
    }
    const confirmed = await requestConfirmDialog({
      title: 'Eliminar libreta',
      message: `Se eliminara la libreta "${current.title}" con sus paginas y adjuntos.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    await deleteNotebook(current.id)
    setSelectedPageId(null)
    await refreshNotebooks()
    markDataSaved()
  }

  function handleNotebookSidebarModeChange(mode: 'active' | 'archived') {
    setNotebookSidebarMode(mode)
    notebookSidebarModeRef.current = mode
    setNotebookMenuId(null)
    void refreshNotebooks()
  }

  async function handleNotebookArchive(notebook: Notebook) {
    setNotebookMenuId(null)
    await updateNotebook({ ...notebook, archived: true })
    markDataSaved()
    await refreshNotebooks()
  }

  async function handleNotebookUnarchive(notebook: Notebook) {
    setNotebookMenuId(null)
    await updateNotebook({ ...notebook, archived: false })
    markDataSaved()
    await refreshNotebooks()
  }

  async function handlePageDelete(page?: Page) {
    const current = page ?? selectedPage
    if (!current) {
      return
    }
    const confirmed = await requestConfirmDialog({
      title: 'Eliminar pagina',
      message: `Se eliminara la pagina "${current.title}" con sus adjuntos.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    await deletePage(current.id)
    if (selectedNotebookId) {
      await refreshPages(selectedNotebookId)
    }
    await refreshAllPages()
    markDataSaved()
  }

  function openMovePageDialog() {
    if (!selectedPage) {
      return
    }
    setMoveBeforePageId('')
    setMovePageDialogOpen(true)
  }

  function closeMovePageDialog() {
    setMovePageDialogOpen(false)
    setMoveBeforePageId('')
  }

  async function handleMovePageConfirm() {
    if (!selectedNotebookId || !selectedPage) {
      return
    }
    await movePageBefore(selectedNotebookId, selectedPage.id, moveBeforePageId || null)
    await refreshPages(selectedNotebookId)
    closeMovePageDialog()
    markDataSaved()
  }

  async function handlePageFieldChange<K extends keyof Page>(key: K, value: Page[K]) {
    const pageId = selectedPage?.id
    if (!pageId) {
      return
    }
    await enqueuePagePersist(async () => {
      const fresh = await getPageById(pageId)
      if (!fresh) {
        return
      }
      await updatePage({ ...fresh, [key]: value })
      markDataSaved()
      if (selectedNotebookIdRef.current === fresh.notebookId) {
        await refreshPages(fresh.notebookId)
      }
    })
  }

  async function forceSaveNote() {
    if (!selectedPage || !editorRef.current) {
      setBackupStatus('No hay pagina seleccionada para guardar.')
      setBackupStatusType('error')
      return
    }
    setForceSavePending(true)
    try {
      const editor = editorRef.current
      linkifyEditorAutoLinksPreservingCaret(editor)
      const html = editor.innerHTML
      lastSyncedEditorHtmlRef.current = html

      const rawTitle = editorTitleRef.current?.value ?? selectedPage.title
      const nextTitle = rawTitle.trim() ? rawTitle.trim() : (selectedPage.title.trim() || 'Nueva pagina')

      await handlePageFieldChange('title', nextTitle)
      await handlePageFieldChange('content', html)
      setBackupStatus('Nota guardada en este dispositivo.')
      setBackupStatusType('success')
    } catch (error) {
      setBackupStatus(`Error al guardar: ${(error as Error).message}`)
      setBackupStatusType('error')
    } finally {
      setForceSavePending(false)
    }
  }

  forceSaveNoteRef.current = forceSaveNote

  async function handleLogout() {
    if (!unlocked) {
      return
    }
    setLogoutPending(true)
    try {
      if (selectedPage && editorRef.current) {
        await forceSaveNote()
      }
      await pagePersistChainRef.current
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      lockVault()
      setUnlocked(false)
      setPinInput('')
      setPinError('Sesion cerrada. Ingresa tu PIN para volver a ver tus notas.')
      setActionsOpen(false)
      setSearchTerm('')
      setSearchResults([])
      setBackupStatus('Sesion cerrada; tus notas siguen guardadas en este navegador.')
      setBackupStatusType('info')
    } finally {
      setLogoutPending(false)
    }
  }

  useEffect(() => {
    if (!unlocked) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }
      if (event.key.toLowerCase() !== 's') {
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.app-dialog-backdrop, .secret-dialog-backdrop')) {
        return
      }
      event.preventDefault()
      void forceSaveNoteRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [unlocked])

  async function handleSetupPin() {
    if (!user) {
      return
    }
    if (pinInput.trim().length < 4) {
      setPinError('El PIN necesita minimo 4 digitos.')
      return
    }
    const salt = createSalt()
    const hash = await hashPin(pinInput, salt)
    const updatedUser = {
      ...user,
      sessionConfig: {
        pinHash: hash,
        salt,
        iterations: 100_000,
      },
    }
    await updateUser(updatedUser)
    markDataSaved()
    await unlockVaultWithPin(pinInput, salt, 100_000)
    setUser(updatedUser)
    await refreshNotebooks()
    setPinInput('')
    setPinError('')
    setUnlockAttempts(0)
    setUnlockBlockedUntil(0)
    setUnlocked(true)
  }

  async function handleUnlock() {
    if (!user?.sessionConfig) {
      return
    }
    const now = Date.now()
    if (now < unlockBlockedUntil) {
      const remainingSeconds = Math.max(1, Math.ceil((unlockBlockedUntil - now) / 1000))
      setPinError(`Demasiados intentos. Espera ${remainingSeconds}s.`)
      return
    }
    const hash = await hashPin(pinInput, user.sessionConfig.salt, user.sessionConfig.iterations)
    if (hash !== user.sessionConfig.pinHash) {
      const nextAttempts = unlockAttempts + 1
      const backoffMs = Math.min(30_000, 2 ** Math.min(6, nextAttempts - 1) * 1000)
      setUnlockAttempts(nextAttempts)
      setUnlockBlockedUntil(Date.now() + backoffMs)
      setPinError(`PIN incorrecto. Espera ${Math.ceil(backoffMs / 1000)}s para reintentar.`)
      return
    }
    try {
      await unlockVaultWithPin(pinInput, user.sessionConfig.salt, user.sessionConfig.iterations)

      try {
        await encryptExistingDataAtRest()
      } catch (error) {
        setBackupStatus(`No se pudo completar la migracion de cifrado: ${(error as Error).message}`)
        setBackupStatusType('error')
      }
      await refreshNotebooks()
      markDataSaved()

      setUnlocked(true)
      setPinInput('')
      setPinError('')
      setUnlockAttempts(0)
      setUnlockBlockedUntil(0)
    } catch (error) {
      setPinError((error as Error).message || 'No se pudo desbloquear la sesion.')
    }
  }

  submitLockScreenRef.current = () => {
    if (!user) {
      return
    }
    void (user.sessionConfig ? handleUnlock() : handleSetupPin())
  }

  function appendLockPinDigit(digit: string) {
    if (!/^[0-9]$/.test(digit)) {
      return
    }
    setPinInput((prev) => (prev.length >= MAX_PIN_DIGITS ? prev : prev + digit))
  }

  function removeLastLockPinDigit() {
    setPinInput((prev) => prev.slice(0, -1))
  }

  useEffect(() => {
    if (user == null || unlocked || secretDialog != null) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.secret-dialog-backdrop, .app-dialog-backdrop')) {
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        submitLockScreenRef.current()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        setPinInput((prev) => prev.slice(0, -1))
        return
      }
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        setPinInput((prev) => (prev.length >= MAX_PIN_DIGITS ? prev : prev + event.key))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [user, unlocked, secretDialog])

  async function handlePinChange() {
    if (!user?.sessionConfig) {
      await requestAlertDialog({
        title: 'PIN no configurado',
        message: 'Primero configura un PIN para habilitar esta opcion.',
      })
      return
    }

    const currentPin = await requestSecret('PIN actual', 'Continuar')
    if (!currentPin) {
      return
    }
    const currentHash = await hashPin(
      currentPin,
      user.sessionConfig.salt,
      user.sessionConfig.iterations,
    )
    if (currentHash !== user.sessionConfig.pinHash) {
      await requestAlertDialog({
        title: 'PIN incorrecto',
        message: 'El PIN actual no coincide.',
      })
      return
    }

    const newPin = await requestSecret('Nuevo PIN', 'Guardar PIN')
    if (!newPin) {
      return
    }
    if (newPin.trim().length < 4) {
      await requestAlertDialog({
        title: 'PIN invalido',
        message: 'El PIN nuevo necesita minimo 4 digitos.',
      })
      return
    }

    const newSalt = createSalt()
    const newIterations = 100_000
    const newHash = await hashPin(newPin, newSalt, newIterations)

    await rotateEncryptionPin(
      currentPin,
      user.sessionConfig.salt,
      user.sessionConfig.iterations,
      newPin,
      newSalt,
      newIterations,
    )

    const updatedUser: UserLocal = {
      ...user,
      sessionConfig: {
        pinHash: newHash,
        salt: newSalt,
        iterations: newIterations,
      },
    }
    await updateUser(updatedUser)
    setUser(updatedUser)
    markDataSaved()
    setBackupStatus('PIN actualizado y datos recifrados correctamente.')
    setBackupStatusType('success')
  }

  async function processImagePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (!selectedPageId) {
      return
    }
    const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith('image/'))
    if (!item) {
      return
    }

    event.preventDefault()
    const file = item.getAsFile()
    if (!file) {
      return
    }

    const pageId = selectedPageId
    const pasteMarker = insertImagePasteMarker(event.currentTarget)
    setPastingImage(true)
    try {
      const processed = await downscaleImage(file)
      await enqueuePagePersist(async () => {
        const existingAttachments = await listAttachmentsByPage(pageId)
        const attachmentName = buildAttachmentName(existingAttachments.length + 1)
        const attachment = await addAttachment(
          pageId,
          processed.blob,
          processed.width,
          processed.height,
          attachmentName,
        )
        const fresh = await getPageById(pageId)
        if (!fresh) {
          return
        }
        const imageToken = attachment.name ?? attachment.id
        const visibleEditor =
          selectedPageId === pageId && editorBoundPageIdRef.current === pageId ? editorRef.current : null
        const nextContent =
          visibleEditor
            ? insertImageReferenceAtPasteMarker(visibleEditor, pasteMarker, imageToken)
            : appendImageReferenceToContent(fresh.content, imageToken)
        if (!visibleEditor && pasteMarker?.isConnected) {
          pasteMarker.remove()
        }
        await updatePage({ ...fresh, content: nextContent })
        if (visibleEditor) {
          lastSyncedEditorHtmlRef.current = nextContent
        }
        markDataSaved()
        if (selectedNotebookIdRef.current === fresh.notebookId) {
          await refreshPages(fresh.notebookId)
        }
      })
    } finally {
      setPastingImage(false)
    }
  }

  function flushEditorContentFromDom(editor: HTMLDivElement) {
    if (!selectedPage) {
      return
    }
    linkifyEditorAutoLinksPreservingCaret(editor)
    const html = editor.innerHTML
    if (selectedPage.content === html || lastSyncedEditorHtmlRef.current === html) {
      return
    }
    lastSyncedEditorHtmlRef.current = html
    void handlePageFieldChange('content', html)
  }

  function applyEditorCommand(
    command:
      | 'bold'
      | 'italic'
      | 'underline'
      | 'strikeThrough'
      | 'foreColor'
      | 'insertUnorderedList'
      | 'insertOrderedList',
    value?: string,
  ) {
    if (!selectedPage || !editorRef.current) {
      return
    }
    editorRef.current.focus()
    document.execCommand(command, false, value)
    flushEditorContentFromDom(editorRef.current)
  }

  function applyEditorHistory(action: 'undo' | 'redo') {
    if (!selectedPage || !editorRef.current) {
      return
    }
    editorRef.current.focus()
    document.execCommand(action, false)
    flushEditorContentFromDom(editorRef.current)
  }

  function applyEditorBlockquote() {
    if (!selectedPage || !editorRef.current) {
      return
    }
    const editor = editorRef.current
    editor.focus()
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const existing = blockquoteContainingRange(editor, selection.getRangeAt(0))
      if (existing) {
        const marker = insertCaretMarkerBeforeCollapsed(selection.getRangeAt(0))
        unwrapBlockquoteElement(existing)
        if (marker?.isConnected) {
          restoreCaretAtMarker(marker, selection)
        }
        editor.focus()
        flushEditorContentFromDom(editor)
        return
      }
    }
    document.execCommand('formatBlock', false, 'blockquote')
    flushEditorContentFromDom(editor)
  }

  function getApproxFontSizePxFromRange(range: Range, editorRoot: HTMLElement): number {
    let el: HTMLElement | null =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? (range.startContainer.parentElement as HTMLElement | null)
        : (range.startContainer as HTMLElement)
    while (el && el !== editorRoot) {
      const inline = el.style?.fontSize
      if (inline) {
        const parsed = parseFloat(inline)
        if (!Number.isNaN(parsed)) {
          return parsed
        }
      }
      el = el.parentElement
    }
    const rootSize = window.getComputedStyle(editorRoot).fontSize
    const fallback = parseFloat(rootSize)
    return Number.isNaN(fallback) ? 16 : fallback
  }

  /** Mueve el tamano del texto seleccionado N escalones en la escala (p. ej. 3 con A+ / A−). */
  function applySelectionFontSizeStep(stepDelta: number) {
    if (!selectedPage || !editorRef.current) {
      return
    }
    const editor = editorRef.current
    editor.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return
    }
    const range = selection.getRangeAt(0)
    const currentPx = getApproxFontSizePxFromRange(range, editor)
    let bestIdx = 0
    let bestDiff = Infinity
    for (let i = 0; i < FONT_SIZE_STEPS_PX.length; i++) {
      const diff = Math.abs(FONT_SIZE_STEPS_PX[i] - currentPx)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIdx = i
      }
    }
    const nextIdx = Math.max(
      0,
      Math.min(FONT_SIZE_STEPS_PX.length - 1, bestIdx + stepDelta),
    )
    const nextPx = FONT_SIZE_STEPS_PX[nextIdx]
    const span = document.createElement('span')
    span.style.fontSize = `${nextPx}px`
    try {
      range.surroundContents(span)
    } catch {
      const fragment = range.extractContents()
      span.appendChild(fragment)
      range.insertNode(span)
    }
    selection.removeAllRanges()
    const nextRange = document.createRange()
    nextRange.selectNodeContents(span)
    nextRange.collapse(false)
    selection.addRange(nextRange)

    flushEditorContentFromDom(editor)
  }

  function handleEditorRichTextClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    const link = target?.closest('a.editor-img-ref')
    if (!link || !editorRef.current?.contains(link)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const token = link.getAttribute('data-img-ref')
    if (!token) {
      return
    }
    const attachment = selectedPageAttachments.find(
      (a) => (a.name ?? a.id) === token || a.id === token,
    )
    if (attachment) {
      openAttachmentModal(attachment)
    }
  }

  function handleEditorInput(event: FormEvent<HTMLDivElement>) {
    if (!selectedPage) {
      return
    }
    const el = event.currentTarget
    linkifyEditorAutoLinksPreservingCaret(el)
    const html = el.innerHTML
    if (selectedPage.content === html || lastSyncedEditorHtmlRef.current === html) {
      return
    }
    lastSyncedEditorHtmlRef.current = html
    void handlePageFieldChange('content', html)
  }

  function handleSearch(term: string) {
    setSearchTerm(term)
    if (!term.trim()) {
      setSearchResults([])
      return
    }

    void (async () => {
      const allNotebooks = await listNotebooks()
      const allPages = await listAllPages()
      const index = buildSearchIndex(allNotebooks, allPages) as MiniSearch<{
        id: string
        notebookId: string
        notebookTitle: string
        pageTitle: string
        content: string
        tags: string
        updatedAt: number
      }>
      setSearchResults(querySearch(index, term))
    })()
  }

  async function openSearchResult(result: SearchResult) {
    const all = await listNotebooks()
    const nb = all.find((notebook) => notebook.id === result.notebookId)
    if (nb && isNotebookArchived(nb)) {
      notebookSidebarModeRef.current = 'archived'
      setNotebookSidebarMode('archived')
    }
    setSelectedNotebookId(result.notebookId)
    setSidebarPanelMode('library')
    setSidebarView('pages')
    await refreshPages(result.notebookId)
    setSelectedPageId(result.pageId)
  }

  async function openBookmarkPage(pageId: string) {
    const target = allPages.find((page) => page.id === pageId)
    if (!target) {
      return
    }
    const nb = notebooks.find((notebook) => notebook.id === target.notebookId)
    if (nb && isNotebookArchived(nb)) {
      notebookSidebarModeRef.current = 'archived'
      setNotebookSidebarMode('archived')
    } else {
      notebookSidebarModeRef.current = 'active'
      setNotebookSidebarMode('active')
    }
    setSelectedNotebookId(target.notebookId)
    setSidebarView('pages')
    await refreshPages(target.notebookId)
    setSelectedPageId(target.id)
  }


  async function removeAttachment(attachmentId: string) {
    await deleteAttachment(attachmentId)
    if (selectedNotebookId) {
      await refreshPages(selectedNotebookId)
    }
    markDataSaved()
  }

  async function copyAttachmentReference(attachment: Attachment) {
    const token = `[img:${attachment.name ?? attachment.id}]`
    try {
      await navigator.clipboard.writeText(token)
      setBackupStatus(`Referencia copiada: ${token}`)
      setBackupStatusType('info')
    } catch {
      setBackupStatus(`No se pudo copiar automaticamente. Referencia: ${token}`)
      setBackupStatusType('error')
    }
  }

  function openAttachmentModal(attachment: Attachment) {
    setImageModalAttachment(attachment)
  }

  function closeAttachmentModal() {
    setImageModalAttachment(null)
  }

  async function handleExportEncryptedBackup() {
    const passphrase = await requestSecret('Clave para cifrar backup', 'Cifrar y exportar')
    if (!passphrase) {
      return
    }

    try {
      const payload = await exportBackupPayload()
      const encrypted = await serializeEncryptedBackup(payload, passphrase)
      const blob = new Blob([encrypted], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const timestamp = new Date().toISOString().replaceAll(':', '-')
      anchor.href = url
      anchor.download = `local-notebook-${timestamp}.mynote.enc`
      anchor.click()
      URL.revokeObjectURL(url)
      setBackupStatus('Backup cifrado exportado.')
      setBackupStatusType('success')
    } catch (error) {
      setBackupStatus((error as Error).message || 'No se pudo exportar el backup.')
      setBackupStatusType('error')
      await requestAlertDialog({
        title: 'Error al exportar',
        message: (error as Error).message || 'No se pudo exportar el backup.',
      })
    }
  }

  async function handleImportEncryptedBackup() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.enc,.mynote.enc,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        return
      }

      void (async () => {
        setBackupStatus('Importando backup cifrado...')
        setBackupStatusType('info')
        const passphrase = await requestSecret('Clave para descifrar backup', 'Descifrar e importar')
        if (!passphrase) {
          setBackupStatus('Importacion cancelada: no se ingreso clave.')
          setBackupStatusType('info')
          return
        }
        const shouldOverwrite = await requestConfirmDialog({
          title: 'Modo de importacion',
          message: 'Aceptar = reemplazar datos locales. Cancelar = intentar merge sin borrar lo actual.',
          confirmLabel: 'Reemplazar',
          cancelLabel: 'Merge',
        })
        try {
          const text = await file.text()
          const payload = await parseEncryptedBackup(text, passphrase)
          if (shouldOverwrite) {
            await importBackupPayload(payload)
          } else {
            await importBackupPayloadWithMode(payload, 'merge')
          }
          markDataSaved()
          await bootstrap()
          setBackupStatus(
            shouldOverwrite
              ? 'Backup importado correctamente (reemplazo total).'
              : 'Backup importado correctamente (merge sin borrar datos locales).',
          )
          setBackupStatusType('success')
        } catch (error) {
          const message = (error as Error).message || 'No se pudo importar el backup.'
          setBackupStatus(`Error al importar: ${message}`)
          setBackupStatusType('error')
          await requestAlertDialog({
            title: 'Error al importar backup',
            message,
          })
        }
      })()
    }
    input.click()
  }

  function requestSecret(title: string, confirmLabel: string): Promise<string | null> {
    setSecretInput('')
    setSecretVisible(false)
    setSecretDialog({ title, confirmLabel })
    return new Promise((resolve) => {
      secretResolverRef.current = resolve
    })
  }

  function closeSecretDialog(value: string | null) {
    setSecretDialog(null)
    setSecretVisible(false)
    const resolver = secretResolverRef.current
    secretResolverRef.current = null
    resolver?.(value)
  }

  function requestTextDialog(config: TextDialogConfig): Promise<string | null> {
    setAppDialogInput(config.initialValue ?? '')
    setAppDialog({ ...config, kind: 'text' })
    return new Promise((resolve) => {
      appDialogResolverRef.current = resolve as (value: unknown) => void
    })
  }

  function requestConfirmDialog(config: ConfirmDialogConfig): Promise<boolean> {
    setAppDialogInput('')
    setAppDialog({ ...config, kind: 'confirm' })
    return new Promise((resolve) => {
      appDialogResolverRef.current = resolve as (value: unknown) => void
    })
  }

  async function requestAlertDialog(config: AlertDialogConfig): Promise<void> {
    setAppDialogInput('')
    setAppDialog({ ...config, kind: 'alert' })
    await new Promise<void>((resolve) => {
      appDialogResolverRef.current = () => resolve()
    })
  }

  function closeAppDialog(value: string | boolean | null) {
    setAppDialog(null)
    setAppDialogInput('')
    const resolver = appDialogResolverRef.current
    appDialogResolverRef.current = null
    resolver?.(value)
  }

  function renderAppDialog() {
    if (!appDialog) {
      return null
    }

    const toneClass = appDialog.tone === 'danger' ? 'danger' : 'neutral'
    const message = appDialog.message ?? ''

    if (appDialog.kind === 'alert') {
      return (
        <section className="app-dialog-backdrop" role="presentation">
          <div className={`app-dialog ${toneClass}`} role="alertdialog" aria-modal="true" aria-label={appDialog.title}>
            <h2>{appDialog.title}</h2>
            {message ? <p>{message}</p> : null}
            <div className="app-dialog-actions">
              <button type="button" className="primary" onClick={() => closeAppDialog(true)}>
                {appDialog.confirmLabel ?? 'Entendido'}
              </button>
            </div>
          </div>
        </section>
      )
    }

    if (appDialog.kind === 'confirm') {
      return (
        <section className="app-dialog-backdrop" role="presentation">
          <div className={`app-dialog ${toneClass}`} role="dialog" aria-modal="true" aria-label={appDialog.title}>
            <h2>{appDialog.title}</h2>
            {message ? <p>{message}</p> : null}
            <div className="app-dialog-actions">
              <button type="button" onClick={() => closeAppDialog(false)}>
                {appDialog.cancelLabel ?? 'Cancelar'}
              </button>
              <button type="button" className="primary" onClick={() => closeAppDialog(true)}>
                {appDialog.confirmLabel}
              </button>
            </div>
          </div>
        </section>
      )
    }

    return (
      <section className="app-dialog-backdrop" role="presentation">
        <div className={`app-dialog ${toneClass}`} role="dialog" aria-modal="true" aria-label={appDialog.title}>
          <h2>{appDialog.title}</h2>
          {message ? <p>{message}</p> : null}
          <input
            value={appDialogInput}
            autoFocus
            onChange={(event) => setAppDialogInput(event.target.value)}
            placeholder={appDialog.placeholder ?? ''}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                closeAppDialog(appDialogInput.trim() || null)
              }
              if (event.key === 'Escape') {
                closeAppDialog(null)
              }
            }}
          />
          <div className="app-dialog-actions">
            <button type="button" onClick={() => closeAppDialog(null)}>
              {appDialog.cancelLabel ?? 'Cancelar'}
            </button>
            <button type="button" className="primary" onClick={() => closeAppDialog(appDialogInput.trim() || null)}>
              {appDialog.confirmLabel}
            </button>
          </div>
        </div>
      </section>
    )
  }

  function renderSecretDialog() {
    if (!secretDialog) {
      return null
    }

    return (
      <section className="secret-dialog-backdrop" role="presentation">
        <div className="secret-dialog" role="dialog" aria-modal="true" aria-label={secretDialog.title}>
          <h2>{secretDialog.title}</h2>
          <input
            value={secretInput}
            type={secretVisible ? 'text' : 'password'}
            autoFocus
            onChange={(event) => setSecretInput(event.target.value)}
            placeholder="Escribe la clave"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                closeSecretDialog(secretInput.trim() || null)
              }
              if (event.key === 'Escape') {
                closeSecretDialog(null)
              }
            }}
          />
          <label className="secret-visibility">
            <input
              type="checkbox"
              checked={secretVisible}
              onChange={(event) => setSecretVisible(event.target.checked)}
            />
            Mostrar clave
          </label>
          <div className="secret-dialog-actions">
            <button type="button" onClick={() => closeSecretDialog(null)}>Cancelar</button>
            <button type="button" onClick={() => closeSecretDialog(secretInput.trim() || null)}>
              {secretDialog.confirmLabel}
            </button>
          </div>
        </div>
      </section>
    )
  }

  function renderMovePageDialog() {
    if (!movePageDialogOpen || !selectedPage) {
      return null
    }

    const moveCandidates = pages.filter((page) => page.id !== selectedPage.id)

    return (
      <section className="app-dialog-backdrop" role="presentation">
        <div className="app-dialog" role="dialog" aria-modal="true" aria-label="Mover pagina">
          <h2>Mover pagina</h2>
          <p>
            Selecciona antes de que pagina quieres mover <strong>{selectedPage.title}</strong>.
          </p>
          <label className="app-dialog-field">
            <span>Antes de la pagina</span>
            <select
              className="page-combo"
              value={moveBeforePageId}
              onChange={(event) => setMoveBeforePageId(event.target.value)}
            >
              <option value="">Al final</option>
              {moveCandidates.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title}
                </option>
              ))}
            </select>
          </label>
          <div className="app-dialog-actions">
            <button type="button" onClick={closeMovePageDialog}>
              Cancelar
            </button>
            <button type="button" className="primary" onClick={() => void handleMovePageConfirm()}>
              Mover
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (!user) {
    return <main className="app-shell">Inicializando...</main>
  }

  if (!unlocked) {
    return (
      <>
        <main className="app-shell lock-screen">
          <h1>Libreta local</h1>
          <p>Tu sesion se guarda solo en este navegador.</p>
          <div className="pin-entry">
            <div
              className="pin-display"
              role="status"
              aria-live="polite"
              aria-label={`${pinInput.length} digitos ingresados`}
            >
              {pinInput.length > 0 ? (
                <span className="pin-display-dots">{'\u2022'.repeat(pinInput.length)}</span>
              ) : (
                <span className="pin-display-placeholder">Toca los numeros o escribe con el teclado</span>
              )}
            </div>
            <div className="pin-keypad" role="group" aria-label="Teclado numerico">
              {(['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const).map((digit) => (
                <button key={digit} type="button" className="pin-key" onClick={() => appendLockPinDigit(digit)}>
                  {digit}
                </button>
              ))}
              <button
                type="button"
                className="pin-key pin-key-wide"
                onClick={removeLastLockPinDigit}
                aria-label="Borrar ultimo digito"
              >
                Borrar
              </button>
              <button type="button" className="pin-key" onClick={() => appendLockPinDigit('0')}>
                0
              </button>
            </div>
          </div>
          <button type="button" onClick={user.sessionConfig ? handleUnlock : handleSetupPin}>
            {user.sessionConfig ? 'Desbloquear' : 'Configurar PIN local'}
          </button>
          {pinError ? <p className="error">{pinError}</p> : null}
        </main>
        {renderSecretDialog()}
        {renderAppDialog()}
        {renderMovePageDialog()}
      </>
    )
  }

  return (
    <>
      <main className="app-shell">
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
                  onChange={(event) => handleSearch(event.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className={`app-header-actions-btn${actionsOpen ? ' is-open' : ''}`}
              onClick={() => setActionsOpen((value) => !value)}
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
            <button type="button" onClick={() => void handleExportEncryptedBackup()}>Exportar cifrado</button>
            <button type="button" onClick={() => void handleImportEncryptedBackup()}>Importar cifrado</button>
            <button type="button" onClick={() => void handlePinChange()}>Cambiar PIN</button>
            <button type="button" onClick={() => setNotebooksHidden((value) => !value)}>
              {notebooksHidden ? 'Mostrar barra de libretas' : 'Ocultar barra de libretas'}
            </button>
            <button
              type="button"
              className="actions-logout-button"
              disabled={logoutPending || forceSavePending || pastingImage}
              onClick={() => void handleLogout()}
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
            <button key={result.pageId} type="button" onClick={() => openSearchResult(result)}>
              <strong>{result.pageTitle}</strong> en {result.notebookTitle}
              <span>{result.snippet}</span>
            </button>
          ))}
        </section>
      ) : null}

      <section className={`layout master-detail-layout${notebooksHidden ? ' sidebar-hidden' : notebooksCollapsed ? ' sidebar-collapsed' : ''}`}>
        {!notebooksHidden ? (
          <aside className={`column notebooks master-sidebar${notebooksCollapsed ? ' collapsed' : ''}`}>
          {notebooksCollapsed ? (
            <button
              type="button"
              className="collapse-toggle collapsed-toggle"
              onClick={() => setNotebooksCollapsed(false)}
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
                  onClick={() => setSidebarPanelMode('library')}
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
                  onClick={() => setSidebarPanelMode('bookmarks')}
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
                              onClick={() => toggleBookmarkNotebookExpanded(notebook.id)}
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
                                    onClick={() => void openBookmarkPage(page.id)}
                                  >
                                    <PageTreeTitle page={page} />
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
              <button type="button" className="sidebar-back-button" onClick={() => setSidebarView('notebooks')}>
                <span aria-hidden="true">‹</span> Libretas
              </button>
              <div className="notebook-tree">
                <div className="notebook-tree-header list-item-shell">
                  <span className="notebook-tree-folder">
                    <span className="item-icon notebook-folder-icon" aria-hidden="true">📁</span>
                    <span className="notebook-tree-name">{selectedNotebook?.title ?? 'Libreta'}</span>
                  </span>
                  <button type="button" className="tree-hover-action new-page-action" aria-label="Nueva pagina" title="Nueva pagina" onClick={handlePageCreate}>+</button>
                </div>
                <ul className="pages-tree" aria-label="Paginas de la libreta">
                  {pages.map((page) => (
                    <li key={page.id} className={`page-tree-item list-item-shell${page.id === selectedPageId ? ' active' : ''}`}>
                      <button type="button" className={`page-tree-link${page.id === selectedPageId ? ' active' : ''}`} onClick={() => setSelectedPageId(page.id)}>
                        <PageTreeTitle page={page} />
                      </button>
                      <button type="button" className="tree-hover-action tree-menu-action" aria-label={`Opciones de ${page.title}`} title="Opciones" onClick={(event) => { event.stopPropagation(); setPageMenuId((value) => (value === page.id ? null : page.id)) }}>···</button>
                      {pageMenuId === page.id ? (
                        <div className="context-menu page-context-menu" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => void handlePageBookmark(page)}>Bookmark</button>
                          <button type="button" onClick={openMovePageDialog}>Mover</button>
                          <button type="button" onClick={() => void handlePageDelete(page)}>Eliminar</button>
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
                    onClick={() => setNotebooksCollapsed(true)}
                    aria-label="Colapsar libretas"
                    title="Colapsar libretas"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <h2>Libretas</h2>
                </div>
                <button type="button" className="new-notebook-action" aria-label="Nueva libreta" title="Nueva libreta" onClick={handleNotebookCreate}>+</button>
              </div>
              <div className="notebook-sidebar-tabs" role="tablist" aria-label="Vista de libretas">
                <button
                  type="button"
                  role="tab"
                  aria-selected={notebookSidebarMode === 'active'}
                  className={`notebook-sidebar-tab${notebookSidebarMode === 'active' ? ' is-active' : ''}`}
                  onClick={() => handleNotebookSidebarModeChange('active')}
                >
                  Activas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={notebookSidebarMode === 'archived'}
                  className={`notebook-sidebar-tab${notebookSidebarMode === 'archived' ? ' is-active' : ''}`}
                  onClick={() => handleNotebookSidebarModeChange('archived')}
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
                    onClick={() => {
                      setSelectedNotebookId(notebook.id)
                      setSidebarView('pages')
                      void refreshPages(notebook.id)
                    }}
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
                    onClick={(event) => {
                      event.stopPropagation()
                      setNotebookMenuId((value) => (value === notebook.id ? null : notebook.id))
                    }}
                  >
                    ···
                  </button>
                  {notebookMenuId === notebook.id ? (
                    <div className="context-menu" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => void handleNotebookRename(notebook)}>Renombrar</button>
                      {isNotebookArchived(notebook) ? (
                        <button type="button" onClick={() => void handleNotebookUnarchive(notebook)}>Desarchivar</button>
                      ) : (
                        <button type="button" onClick={() => void handleNotebookArchive(notebook)}>Archivar</button>
                      )}
                      <button type="button" onClick={() => void handleNotebookDelete(notebook)}>Eliminar</button>
                    </div>
                  ) : null}
                </article>
              ))}
            </>
              )}
            </>
          )}
          </aside>
        ) : null}

        <section className="workspace-panel">
          <article className="column editor master-detail-main">
            {!selectedNotebookId ? (
              <div className="workspace-empty-state" role="status">
                <NotebookEmptyIcon />
                <p className="workspace-empty-text">
                  Selecciona una libreta en la barra lateral, o cambia entre Activas y Archivadas.
                </p>
              </div>
            ) : !selectedPage ? (
            <div className="workspace-empty-state" role="status">
              <PageEmptyIcon />
              <p className="workspace-empty-text">Selecciona una pagina para editar.</p>
            </div>
          ) : (
            <>
              <div className="editor-header">
                <input
                  ref={editorTitleRef}
                  className="editor-title"
                  value={selectedPage.title}
                  onChange={(event) => {
                    void handlePageFieldChange('title', event.target.value)
                  }}
                />
                <div className="editor-header-actions">
                  <button
                    type="button"
                    className={`editor-icon-button bookmark-icon${isCurrentPageBookmarked ? ' active' : ''}`}
                    aria-pressed={isCurrentPageBookmarked}
                    onClick={() => void handlePageBookmark()}
                    title={isCurrentPageBookmarked ? 'Quitar bookmark' : 'Marcar pagina'}
                    aria-label={isCurrentPageBookmarked ? 'Quitar bookmark' : 'Marcar pagina'}
                  >
                    <BookmarkIcon filled={isCurrentPageBookmarked} />
                  </button>
                  <button
                    type="button"
                    className={`editor-icon-button save-icon${lastSavedAt !== null ? ' saved' : ''}`}
                    disabled={forceSavePending || pastingImage}
                    onClick={() => void forceSaveNote()}
                    title={
                      forceSavePending
                        ? 'Guardando...'
                        : lastSavedAt !== null
                          ? `Guardado ${formatLastSavedDisplay(lastSavedAt)}`
                          : 'Guardar nota (Ctrl/Cmd + S)'
                    }
                    aria-label="Guardar nota"
                  >
                    <CloudSaveIcon saving={forceSavePending} saved={lastSavedAt !== null} />
                  </button>
                </div>
              </div>
              <section className="editor-richtext-shell" aria-label="Editor de contenido enriquecido">
                <div className="editor-format-toolbar editor-format-toolbar-compact">
                  <div className="editor-history-group" role="group" aria-label="Deshacer y rehacer">
                    <button type="button" className="toolbar-icon-btn" onClick={() => applyEditorHistory('undo')} title="Deshacer (Ctrl/Cmd+Z)" aria-label="Deshacer"><UndoIcon /></button>
                    <button type="button" className="toolbar-icon-btn" onClick={() => applyEditorHistory('redo')} title="Rehacer (Ctrl/Cmd+Shift+Z)" aria-label="Rehacer"><RedoIcon /></button>
                  </div>
                  <button type="button" className="toolbar-icon-btn" onClick={() => applyEditorCommand('bold')} title="Negrita (Ctrl/Cmd+B)" aria-label="Negrita"><strong>B</strong></button>
                  <button type="button" className="toolbar-icon-btn" onClick={() => applyEditorCommand('italic')} title="Cursiva (Ctrl/Cmd+I)" aria-label="Cursiva"><em>I</em></button>
                  <button type="button" className="toolbar-icon-btn" onClick={() => applyEditorCommand('insertUnorderedList')} title="Lista con viñetas" aria-label="Lista con viñetas"><ListBulletIcon /></button>
                  <button type="button" className="toolbar-icon-btn" onClick={() => applyEditorCommand('insertOrderedList')} title="Lista numerada" aria-label="Lista numerada"><ListNumberIcon /></button>
                  <div className="editor-format-menu-wrap" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className={`toolbar-format-trigger${formatMenuOpen ? ' is-open' : ''}`}
                      onClick={() => setFormatMenuOpen((value) => !value)}
                      aria-expanded={formatMenuOpen}
                      aria-haspopup="menu"
                      aria-label="Opciones de formato"
                    >
                      Formato
                    </button>
                    {formatMenuOpen ? (
                      <div className="editor-format-popover" role="menu" aria-label="Opciones de formato">
                        <div className="format-popover-row" role="group" aria-label="Tamano del texto">
                          <button type="button" className="toolbar-icon-btn font-size-step" onClick={() => applySelectionFontSizeStep(-3)} title="Reducir tamano" aria-label="Reducir tamano del texto">A−</button>
                          <button type="button" className="toolbar-icon-btn font-size-step" onClick={() => applySelectionFontSizeStep(3)} title="Aumentar tamano" aria-label="Aumentar tamano del texto">A+</button>
                        </div>
                        <div className="format-popover-row" role="group" aria-label="Estilos secundarios">
                          <button type="button" className="toolbar-icon-btn" onClick={applyEditorBlockquote} title="Cita" aria-label="Alternar cita"><QuoteIcon /></button>
                          <button type="button" className="toolbar-icon-btn" onClick={() => applyEditorCommand('underline')} title="Subrayado" aria-label="Subrayado"><span className="toolbar-underline">U</span></button>
                          <button type="button" className="toolbar-icon-btn" onClick={() => applyEditorCommand('strikeThrough')} title="Tachado" aria-label="Tachado"><span className="toolbar-strike">S</span></button>
                        </div>
                        <div className="editor-color-palette" role="group" aria-label="Color del texto">
                          {TEXT_COLOR_PALETTE.map((color) => (
                            <button key={color} type="button" className="color-swatch" style={{ backgroundColor: color }} onClick={() => applyEditorCommand('foreColor', color)} title={`Color ${color}`} aria-label={`Aplicar color ${color}`} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div
                  ref={editorRef}
                  className="editor-richtext"
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Escribe tu nota aqui. Puedes pegar imagenes desde portapapeles."
                  onInput={handleEditorInput}
                  onClick={handleEditorRichTextClick}
                  onPaste={(event) => { void processImagePaste(event) }}
                />
                <footer className="editor-footer-tip" role="status">
                  {pastingImage ? 'Procesando screenshot...' : 'Tip: pega screenshot con Ctrl/Cmd + V'}
                </footer>
              </section>
              <section className="attachments">
                <h3>Imagenes de la pagina</h3>
                <div className="attachments-content">
                  {selectedPageAttachments.length === 0 ? (
                    <p className="attachments-empty">No hay imagenes todavia.</p>
                  ) : (
                    <div className="attachment-grid">
                      {selectedPageAttachments.map((attachment) => (
                        <figure key={attachment.id}>
                          <button
                            type="button"
                            className="attachment-preview-button"
                            title="Abrir imagen"
                            onClick={() => openAttachmentModal(attachment)}
                          >
                            <img src={URL.createObjectURL(attachment.blob)} alt={attachment.name ?? 'Adjunto pegado'} />
                          </button>
                          <figcaption>
                            <div className="attachment-meta">
                              <strong>{attachment.name ?? 'imagen-sin-nombre'}</strong>
                              <small>{(attachment.sizeBytes / 1024).toFixed(1)} KB</small>
                            </div>
                            <div className="attachment-actions">
                              <button type="button" onClick={() => void copyAttachmentReference(attachment)}>
                                Copiar ref
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void removeAttachment(attachment.id)
                                }}
                              >
                                Eliminar
                              </button>
                            </div>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
          </article>
        </section>
      </section>
      </main>
      {renderSecretDialog()}
      {renderAppDialog()}
      {renderMovePageDialog()}
      {imageModalAttachment && imageModalUrl ? (
        <section className="image-modal-backdrop" role="presentation" onClick={closeAttachmentModal}>
          <figure className="image-modal" onClick={closeAttachmentModal}>
            <img src={imageModalUrl} alt={imageModalAttachment.name ?? 'Imagen adjunta'} />
            <figcaption>
              {imageModalAttachment.name ?? imageModalAttachment.id} (click para cerrar)
            </figcaption>
          </figure>
        </section>
      ) : null}
    </>
  )
}

export default App

type ProcessedImage = {
  blob: Blob
  width: number
  height: number
}

type DialogTone = 'neutral' | 'danger'

type BaseAppDialog = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: DialogTone
}

type TextDialogConfig = {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  placeholder?: string
  initialValue?: string
  tone?: DialogTone
}

type ConfirmDialogConfig = {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  tone?: DialogTone
}

type AlertDialogConfig = {
  title: string
  message?: string
  confirmLabel?: string
  tone?: DialogTone
}

type TextAppDialog = BaseAppDialog & {
  kind: 'text'
  confirmLabel: string
  placeholder?: string
}

type ConfirmAppDialog = BaseAppDialog & {
  kind: 'confirm'
  confirmLabel: string
}

type AlertAppDialog = BaseAppDialog & {
  kind: 'alert'
}

type AppDialogState = TextAppDialog | ConfirmAppDialog | AlertAppDialog

async function downscaleImage(file: File): Promise<ProcessedImage> {
  const dataUrl = await readAsDataUrl(file)
  const image = await loadImage(dataUrl)
  const maxDimension = 1800

  let width = image.width
  let height = image.height

  if (Math.max(width, height) > maxDimension) {
    const ratio = maxDimension / Math.max(width, height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('No se pudo procesar la imagen.')
  }

  context.drawImage(image, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.85)
  })

  return {
    blob: blob ?? file,
    width,
    height,
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo leer la imagen del portapapeles.'))
    image.src = src
  })
}

function buildAttachmentName(index: number): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return `img-${stamp}-${String(index).padStart(2, '0')}`
}
