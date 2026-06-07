import {
  useCallback,
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
import { AppHeader } from './ui/AppHeader'
import { LockScreen } from './ui/LockScreen'
import { Sidebar } from './ui/Sidebar'
import { EditorPanel } from './ui/EditorPanel'
import {
  AppDialog,
  ImageModal,
  MovePageDialog,
  SecretDialog,
} from './ui/AppDialogs'
import { useAppDialogs } from './ui/hooks/useAppDialogs'
import { useImageModal } from './ui/hooks/useImageModal'
import { useInactivityLock } from './ui/hooks/useInactivityLock'
import { useSidebarState } from './ui/hooks/useSidebarState'
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
  const [actionsOpen, setActionsOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [formatMenuOpen, setFormatMenuOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const {
    secretDialog,
    secretInput,
    secretVisible,
    appDialog,
    appDialogInput,
    movePageDialogOpen,
    moveBeforePageId,
    setSecretInput,
    setSecretVisible,
    setAppDialogInput,
    setMoveBeforePageId,
    openMovePageDialog: openMovePageDialogState,
    closeMovePageDialog,
    requestSecret,
    closeSecretDialog,
    requestTextDialog,
    requestConfirmDialog,
    requestAlertDialog,
    closeAppDialog,
  } = useAppDialogs()
  const {
    notebooksHidden,
    notebookMenuId,
    pageMenuId,
    sidebarView,
    sidebarPanelMode,
    notebookSidebarMode,
    notebookSidebarModeRef,
    notebooksCollapsed,
    setNotebooksHidden,
    setNotebookMenuId,
    setPageMenuId,
    setSidebarView,
    setSidebarPanelMode,
    setNotebookSidebarMode,
    setNotebooksCollapsed,
    toggleBookmarkNotebookExpanded,
    isBookmarkNotebookExpanded,
  } = useSidebarState()
  const {
    imageModalAttachment,
    imageModalUrl,
    openAttachmentModal,
    closeAttachmentModal,
  } = useImageModal()

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
  }, [setNotebookMenuId, setPageMenuId])

  useEffect(() => {
    selectedNotebookIdRef.current = selectedNotebookId
  }, [selectedNotebookId])

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
  }, [setNotebookMenuId, setPageMenuId])

  const handleAutoLock = useCallback(() => {
    lockVault()
    setUnlocked(false)
    setPinInput('')
    setPinError('Sesion bloqueada por inactividad. Ingresa tu PIN.')
  }, [])

  useInactivityLock({
    unlocked,
    delayMs: INACTIVITY_AUTO_LOCK_MS,
    forceSaveNoteRef,
    pagePersistChainRef,
    onAutoLock: handleAutoLock,
  })

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

  const selectedPageIndex = useMemo(
    () => pages.findIndex((page) => page.id === selectedPageId),
    [pages, selectedPageId],
  )

  const saveStatusLabel = useMemo(() => {
    if (forceSavePending) {
      return 'Guardando…'
    }
    if (pastingImage) {
      return 'Procesando imagen…'
    }
    if (lastSavedAt !== null) {
      const secondsAgo = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000))
      return secondsAgo < 10 ? 'Guardado ahora' : 'Sin cambios'
    }
    return 'Sin cambios'
  }, [forceSavePending, lastSavedAt, pastingImage])

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
    const page = await createPage(selectedNotebookId, 'Nueva página')
    setSidebarPanelMode('library')
    setSidebarView('pages')
    await refreshPages(selectedNotebookId)
    setSelectedPageId(page.id)
    markDataSaved()
    window.setTimeout(() => {
      editorTitleRef.current?.focus()
      editorTitleRef.current?.select()
    }, 0)
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
    openMovePageDialogState()
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
      const nextTitle = rawTitle.trim() ? rawTitle.trim() : (selectedPage.title.trim() || 'Nueva página')

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
      lockVault()
      setUnlocked(false)
      setPinInput('')
      setPinError('Sesión cerrada. Ingresa tu PIN para volver a ver tus notas.')
      setActionsOpen(false)
      setSearchTerm('')
      setSearchResults([])
      setBackupStatus('Sesión cerrada; tus notas siguen guardadas en este navegador.')
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
      setPinError('El PIN necesita mínimo 4 dígitos.')
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
        setBackupStatus(`No se pudo completar la migración de cifrado: ${(error as Error).message}`)
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
      setPinError((error as Error).message || 'No se pudo desbloquear la sesión.')
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
        message: 'Primero configura un PIN para habilitar esta opción.',
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
        title: 'PIN inválido',
        message: 'El PIN nuevo necesita mínimo 4 dígitos.',
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
      setNotebookSidebarMode('archived')
    } else {
      setNotebookSidebarMode('active')
    }
    setSelectedNotebookId(target.notebookId)
    setSidebarPanelMode('library')
    setSidebarView('pages')
    await refreshPages(target.notebookId)
    setSelectedPageId(target.id)
  }

  function showBookmarks() {
    setSidebarPanelMode('bookmarks')
    setNotebooksHidden(false)
    setNotebooksCollapsed(false)
    setActionsOpen(false)
    setCommandOpen(false)
  }

  function formatPageUpdatedAt(ts: number) {
    const date = new Date(ts)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
    if (ts >= startOfToday) {
      return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(date)
    }
    if (ts >= startOfYesterday) {
      return 'Ayer'
    }
    return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(date)
  }

  function getPagePreview(page: Page) {
    const withoutTags = page.content
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return withoutTags.length > 58 ? `${withoutTags.slice(0, 58)}…` : withoutTags
  }

  function selectPreviousPage() {
    if (selectedPageIndex <= 0) {
      return
    }
    setSelectedPageId(pages[selectedPageIndex - 1].id)
  }

  function selectNextPage() {
    if (selectedPageIndex < 0 || selectedPageIndex >= pages.length - 1) {
      return
    }
    setSelectedPageId(pages[selectedPageIndex + 1].id)
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


  if (!user) {
    return <main className="app-shell">Inicializando...</main>
  }

  if (!unlocked) {
    return (
      <>
        <LockScreen
          user={user}
          pinInput={pinInput}
          pinError={pinError}
          onAppendDigit={appendLockPinDigit}
          onRemoveLastDigit={removeLastLockPinDigit}
          onUnlock={() => void handleUnlock()}
          onSetupPin={() => void handleSetupPin()}
        />
        <SecretDialog
          dialog={secretDialog}
          input={secretInput}
          visible={secretVisible}
          onInputChange={setSecretInput}
          onVisibleChange={setSecretVisible}
          onClose={closeSecretDialog}
        />
        <AppDialog
          dialog={appDialog}
          input={appDialogInput}
          onInputChange={setAppDialogInput}
          onClose={closeAppDialog}
        />
        <MovePageDialog
          open={movePageDialogOpen}
          selectedPage={selectedPage}
          pages={pages}
          moveBeforePageId={moveBeforePageId}
          onMoveBeforePageIdChange={setMoveBeforePageId}
          onCancel={closeMovePageDialog}
          onConfirm={() => void handleMovePageConfirm()}
        />
      </>
    )
  }

  return (
    <>
      <main className="app-shell">
        <AppHeader
          actionsOpen={actionsOpen}
          commandOpen={commandOpen}
          searchTerm={searchTerm}
          lastSavedAt={lastSavedAt}
          notebooksHidden={notebooksHidden}
          canCreatePage={selectedNotebookId !== null}
          logoutPending={logoutPending}
          forceSavePending={forceSavePending}
          pastingImage={pastingImage}
          searchResults={searchResults}
          backupStatus={backupStatus}
          backupStatusType={backupStatusType}
          onSearch={handleSearch}
          onToggleCommand={() => {
            setCommandOpen((value) => !value)
            setActionsOpen(false)
          }}
          onToggleActions={() => {
            setActionsOpen((value) => !value)
            setCommandOpen(false)
          }}
          onCreatePage={() => void handlePageCreate()}
          onCreateNotebook={() => void handleNotebookCreate()}
          onShowBookmarks={showBookmarks}
          onExportEncryptedBackup={() => void handleExportEncryptedBackup()}
          onImportEncryptedBackup={() => void handleImportEncryptedBackup()}
          onPinChange={() => void handlePinChange()}
          onToggleNotebooksHidden={() => setNotebooksHidden((value) => !value)}
          onLogout={() => void handleLogout()}
          onOpenSearchResult={(result) => void openSearchResult(result)}
          formatLastSavedDisplay={formatLastSavedDisplay}
        />

        <section className={`layout master-detail-layout${notebooksHidden ? ' sidebar-hidden' : notebooksCollapsed ? ' sidebar-collapsed' : ''}`}>
          <Sidebar
            notebooksHidden={notebooksHidden}
            notebooksCollapsed={notebooksCollapsed}
            sidebarPanelMode={sidebarPanelMode}
            sidebarView={sidebarView}
            selectedNotebookId={selectedNotebookId}
            selectedPageId={selectedPageId}
            selectedNotebook={selectedNotebook}
            pages={pages}
            sidebarNotebooks={sidebarNotebooks}
            notebookSidebarMode={notebookSidebarMode}
            bookmarkTree={bookmarkTree}
            notebookMenuId={notebookMenuId}
            pageMenuId={pageMenuId}
            onExpandNotebooks={() => setNotebooksCollapsed(false)}
            onCollapseNotebooks={() => setNotebooksCollapsed(true)}
            onSidebarPanelModeChange={setSidebarPanelMode}
            onSidebarViewChange={setSidebarView}
            onNotebookSidebarModeChange={handleNotebookSidebarModeChange}
            onNotebookCreate={handleNotebookCreate}
            onPageCreate={handlePageCreate}
            onSelectNotebook={(notebookId) => {
              setSelectedNotebookId(notebookId)
              setSidebarView('pages')
              void refreshPages(notebookId)
            }}
            onSelectPage={setSelectedPageId}
            onToggleNotebookMenu={(notebookId) => setNotebookMenuId((value) => (value === notebookId ? null : notebookId))}
            onTogglePageMenu={(pageId) => setPageMenuId((value) => (value === pageId ? null : pageId))}
            onNotebookRename={(notebook) => void handleNotebookRename(notebook)}
            onNotebookArchive={(notebook) => void handleNotebookArchive(notebook)}
            onNotebookUnarchive={(notebook) => void handleNotebookUnarchive(notebook)}
            onNotebookDelete={(notebook) => void handleNotebookDelete(notebook)}
            onPageBookmark={(page) => void handlePageBookmark(page)}
            onPageMove={openMovePageDialog}
            onPageDelete={(page) => void handlePageDelete(page)}
            onBookmarkNotebookToggle={toggleBookmarkNotebookExpanded}
            isBookmarkNotebookExpanded={isBookmarkNotebookExpanded}
            onOpenBookmarkPage={(pageId) => void openBookmarkPage(pageId)}
            isNotebookArchived={isNotebookArchived}
            isPageBookmarked={isPageBookmarked}
            formatPageUpdatedAt={formatPageUpdatedAt}
            getPagePreview={getPagePreview}
          />

          <EditorPanel
            selectedNotebookId={selectedNotebookId}
            selectedNotebookTitle={selectedNotebook?.title ?? null}
            selectedPage={selectedPage}
            selectedPageAttachments={selectedPageAttachments}
            editorRef={editorRef}
            editorTitleRef={editorTitleRef}
            isCurrentPageBookmarked={isCurrentPageBookmarked}
            lastSavedAt={lastSavedAt}
            forceSavePending={forceSavePending}
            pastingImage={pastingImage}
            formatMenuOpen={formatMenuOpen}
            textColorPalette={TEXT_COLOR_PALETTE}
            saveStatusLabel={saveStatusLabel}
            canMoveToPreviousPage={selectedPageIndex > 0}
            canMoveToNextPage={selectedPageIndex >= 0 && selectedPageIndex < pages.length - 1}
            onCreateNotebook={() => void handleNotebookCreate()}
            onCreatePage={() => void handlePageCreate()}
            onShowBookmarks={showBookmarks}
            onMovePage={openMovePageDialog}
            onSelectPreviousPage={selectPreviousPage}
            onSelectNextPage={selectNextPage}
            onPageDelete={() => void handlePageDelete()}
            onPageTitleChange={(value) => void handlePageFieldChange('title', value)}
            onPageBookmark={() => void handlePageBookmark()}
            onForceSaveNote={() => void forceSaveNote()}
            formatLastSavedDisplay={formatLastSavedDisplay}
            onApplyEditorHistory={applyEditorHistory}
            onApplyEditorCommand={applyEditorCommand}
            onToggleFormatMenu={() => setFormatMenuOpen((value) => !value)}
            onApplySelectionFontSizeStep={applySelectionFontSizeStep}
            onApplyEditorBlockquote={applyEditorBlockquote}
            onEditorInput={handleEditorInput}
            onEditorRichTextClick={handleEditorRichTextClick}
            onProcessImagePaste={(event) => { void processImagePaste(event) }}
            onOpenAttachmentModal={openAttachmentModal}
            onCopyAttachmentReference={(attachment) => void copyAttachmentReference(attachment)}
            onRemoveAttachment={(attachmentId) => void removeAttachment(attachmentId)}
          />
        </section>
      </main>
      <SecretDialog
        dialog={secretDialog}
        input={secretInput}
        visible={secretVisible}
        onInputChange={setSecretInput}
        onVisibleChange={setSecretVisible}
        onClose={closeSecretDialog}
      />
      <AppDialog
        dialog={appDialog}
        input={appDialogInput}
        onInputChange={setAppDialogInput}
        onClose={closeAppDialog}
      />
      <MovePageDialog
        open={movePageDialogOpen}
        selectedPage={selectedPage}
        pages={pages}
        moveBeforePageId={moveBeforePageId}
        onMoveBeforePageIdChange={setMoveBeforePageId}
        onCancel={closeMovePageDialog}
        onConfirm={() => void handleMovePageConfirm()}
      />
      <ImageModal attachment={imageModalAttachment} imageUrl={imageModalUrl} onClose={closeAttachmentModal} />
    </>
  )

}

export default App

type ProcessedImage = {
  blob: Blob
  width: number
  height: number
}

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
