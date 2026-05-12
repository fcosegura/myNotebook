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

const BOOKMARK_TAG = 'bookmark'
const INACTIVITY_AUTO_LOCK_MS = 5 * 60 * 1000
const TEXT_COLOR_PALETTE = ['#f8fafc', '#f87171', '#facc15', '#4ade80', '#60a5fa', '#c084fc', '#f472b6', '#fb923c']
const FONT_SIZE_STEPS_PX = [12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32] as const
const IMG_REF_IN_TEXT_PATTERN = /\[img:([^\]]+)\]/g
const EDITOR_AUTO_LINK_CLASS = 'editor-auto-link'
/** http(s) and www. URLs in plain text (not inside existing anchors). */
const AUTO_LINK_URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi

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

  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [pages, setPages] = useState<Page[]>([])
  const [allPages, setAllPages] = useState<Page[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])

  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [pastingImage, setPastingImage] = useState(false)
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
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [notebooksHidden, setNotebooksHidden] = useState(false)
  const [pagesHidden, setPagesHidden] = useState(false)
  const [densityMode, setDensityMode] = useState<'compact' | 'comfortable'>('comfortable')
  const [notebookMenuId, setNotebookMenuId] = useState<string | null>(null)
  const [imageModalAttachment, setImageModalAttachment] = useState<Attachment | null>(null)
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null)
  const secretResolverRef = useRef<((value: string | null) => void) | null>(null)
  const appDialogResolverRef = useRef<((value: unknown) => void) | null>(null)

  const [notebooksCollapsed, setNotebooksCollapsed] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
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

  function markDataSaved() {
    setLastSavedAt(Date.now())
  }

  useEffect(() => {
    function handleGlobalClick() {
      setNotebookMenuId(null)
    }
    window.addEventListener('click', handleGlobalClick)
    return () => {
      window.removeEventListener('click', handleGlobalClick)
    }
  }, [])

  useEffect(() => {
    if (!imageModalAttachment) {
      setImageModalUrl(null)
      return
    }
    const url = URL.createObjectURL(imageModalAttachment.blob)
    setImageModalUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [imageModalAttachment])

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
        lockVault()
        setUnlocked(false)
        setPinInput('')
        setPinError('Sesion bloqueada por inactividad. Ingresa tu PIN.')
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

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, selectedPageId],
  )

  useEffect(() => {
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

    linkifyEditorAutoLinks(el)
    const html = el.innerHTML
    if (html !== lastSyncedEditorHtmlRef.current) {
      lastSyncedEditorHtmlRef.current = html
      void handlePageFieldChange('content', html)
    }
  }, [selectedPage])

  const selectedPageAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.pageId === selectedPageId),
    [attachments, selectedPageId],
  )

  const selectedPageIndex = useMemo(
    () => pages.findIndex((page) => page.id === selectedPageId),
    [pages, selectedPageId],
  )

  const hasPrevPage = selectedPageIndex > 0
  const hasNextPage = selectedPageIndex >= 0 && selectedPageIndex < pages.length - 1
  const bookmarkOptions = useMemo(() => {
    const notebookById = new Map(notebooks.map((notebook) => [notebook.id, notebook.title]))
    return allPages
      .filter((page) => page.tags.includes(BOOKMARK_TAG))
      .map((page) => ({
        id: page.id,
        notebookId: page.notebookId,
        notebookTitle: notebookById.get(page.notebookId) ?? 'Libreta',
        pageTitle: page.title,
      }))
  }, [allPages, notebooks])
  const isCurrentPageBookmarked = Boolean(selectedPage?.tags.includes(BOOKMARK_TAG))

  function goToPrevPage() {
    if (!hasPrevPage) {
      return
    }
    setSelectedPageId(pages[selectedPageIndex - 1].id)
  }

  function goToNextPage() {
    if (!hasNextPage) {
      return
    }
    setSelectedPageId(pages[selectedPageIndex + 1].id)
  }

  async function bootstrap() {
    lockVault()
    const localUser = await ensureUser()
    setUser(localUser)
    // Always show lock/setup screen on app entry.
    setUnlocked(false)
  }

  async function refreshNotebooks() {
    const allNotebooks = await listNotebooks()
    setNotebooks(allNotebooks)

    if (allNotebooks.length === 0) {
      const notebook = await createNotebook('Mi libreta')
      markDataSaved()
      const refreshed = await listNotebooks()
      setNotebooks(refreshed)
      setSelectedNotebookId(notebook.id)
      await refreshPages(notebook.id)
      return
    }

    const notebookId = selectedNotebookId && allNotebooks.some((notebook) => notebook.id === selectedNotebookId)
      ? selectedNotebookId
      : allNotebooks[0].id
    setSelectedNotebookId(notebookId)
    await refreshPages(notebookId)
  }

  async function refreshPages(notebookId: string) {
    const allPages = await listPagesByNotebook(notebookId)
    setPages(allPages)
    setAllPages(await listAllPages())
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
    await refreshNotebooks()
    setSelectedNotebookId(notebook.id)
    await refreshPages(notebook.id)
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

  async function handlePageBookmark() {
    if (!selectedPage) {
      return
    }
    const pageId = selectedPage.id
    await enqueuePagePersist(async () => {
      const fresh = await getPageById(pageId)
      if (!fresh) {
        return
      }
      const hasBookmark = fresh.tags.includes(BOOKMARK_TAG)
      const updatedTags = hasBookmark
        ? fresh.tags.filter((tag) => tag !== BOOKMARK_TAG)
        : [...fresh.tags, BOOKMARK_TAG]
      await updatePage({ ...fresh, tags: updatedTags })
      markDataSaved()
      if (selectedNotebookIdRef.current === fresh.notebookId) {
        await refreshPages(fresh.notebookId)
      }
    })
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
      setUnlocked(true)
      setPinInput('')
      setPinError('')
      setUnlockAttempts(0)
      setUnlockBlockedUntil(0)

      try {
        await encryptExistingDataAtRest()
      } catch (error) {
        setBackupStatus(`No se pudo completar la migracion de cifrado: ${(error as Error).message}`)
        setBackupStatusType('error')
      }
      await refreshNotebooks()
      markDataSaved()
    } catch (error) {
      setPinError((error as Error).message || 'No se pudo desbloquear la sesion.')
    }
  }

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
        const referenceLine = `\n[img:${attachment.name ?? attachment.id}]`
        const nextContent = `${fresh.content}${fresh.content.endsWith('\n') || !fresh.content ? '' : '\n'}${referenceLine.trimStart()}`
        await updatePage({ ...fresh, content: nextContent })
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
    linkifyEditorAutoLinks(editor)
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
    linkifyEditorAutoLinks(el)
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
    setSelectedNotebookId(result.notebookId)
    await refreshPages(result.notebookId)
    setSelectedPageId(result.pageId)
  }

  async function openBookmarkPage(bookmarkPageId: string) {
    const target = allPages.find((page) => page.id === bookmarkPageId)
    if (!target) {
      return
    }
    setSelectedNotebookId(target.notebookId)
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
        <main className={`app-shell ${densityMode} lock-screen`}>
          <h1>Libreta local</h1>
          <p>Tu sesion se guarda solo en este navegador.</p>
          <input
            value={pinInput}
            onChange={(event) => setPinInput(event.target.value)}
            placeholder="Escribe tu PIN"
            type="password"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void (user.sessionConfig ? handleUnlock() : handleSetupPin())
              }
            }}
          />
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
      <main className={`app-shell ${densityMode}`}>
        <header className="app-header">
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
          <div className="toolbar-group">
            <button type="button" onClick={handleNotebookCreate} title="Nueva libreta">+ Libreta</button>
            <button type="button" onClick={handlePageCreate} title="Nueva pagina" disabled={!selectedNotebookId}>
              + Pagina
            </button>
          </div>
          <button type="button" onClick={() => setActionsOpen((value) => !value)}>
            Acciones {actionsOpen ? '▴' : '▾'}
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
            <button type="button" onClick={() => setPagesHidden((value) => !value)}>
              {pagesHidden ? 'Mostrar barra de paginas' : 'Ocultar barra de paginas'}
            </button>
            <button
              type="button"
              onClick={() => setDensityMode((mode) => (mode === 'comfortable' ? 'compact' : 'comfortable'))}
            >
              {densityMode === 'comfortable' ? 'Usar modo compacto' : 'Usar modo comodo'}
            </button>
          </section>
        ) : null}
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

      <section className="layout master-detail-layout">
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
              </div>
              {notebooks.map((notebook) => (
                <article key={notebook.id} className={`list-item-shell${notebook.id === selectedNotebookId ? ' active' : ''}`}>
                  <button
                    type="button"
                    className={`list-item row-item${notebook.id === selectedNotebookId ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedNotebookId(notebook.id)
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
                    className="item-menu-button"
                    aria-label={`Acciones para ${notebook.title}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setNotebookMenuId((value) => (value === notebook.id ? null : notebook.id))
                    }}
                  >
                    ⋮
                  </button>
                  {notebookMenuId === notebook.id ? (
                    <div className="context-menu" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => void handleNotebookRename(notebook)}>Renombrar</button>
                      <button type="button" onClick={() => void handleNotebookDelete(notebook)}>Eliminar</button>
                    </div>
                  ) : null}
                </article>
              ))}
              <button type="button" className="new-item-button" onClick={handleNotebookCreate}>
                + Nueva libreta
              </button>
            </>
          )}
          </aside>
        ) : null}

        <section className="workspace-panel">
          <article className="column editor master-detail-main">
            {!selectedPage ? (
            <p>Selecciona una pagina para editar.</p>
          ) : (
            <>
              <input
                className="editor-title"
                value={selectedPage.title}
                onChange={(event) => {
                  void handlePageFieldChange('title', event.target.value)
                }}
              />
              <div className="editor-actions">
                <div className="editor-actions-group">
                  <label className="editor-action-field">
                    <span className="editor-action-label">Bookmark</span>
                    <button
                      type="button"
                      className={`bookmark-button${isCurrentPageBookmarked ? ' active' : ''}`}
                      aria-pressed={isCurrentPageBookmarked}
                      onClick={() => void handlePageBookmark()}
                    >
                      {isCurrentPageBookmarked ? 'Quitar bookmark' : 'Marcar pagina actual'}
                    </button>
                  </label>
                  {!pagesHidden ? (
                    <label className="editor-action-field">
                      <span className="editor-action-label">Pagina activa</span>
                      <select
                        className="page-combo"
                        value={selectedPageId ?? ''}
                        onChange={(event) => setSelectedPageId(event.target.value)}
                        aria-label="Seleccionar pagina activa"
                      >
                        {pages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="editor-actions-group">
                  <label className="editor-action-field">
                    <span className="editor-action-label">Gestion de paginas</span>
                    <div className="editor-action-inline">
                      <button type="button" onClick={handlePageCreate}>+ Nueva pagina</button>
                      <button type="button" onClick={openMovePageDialog} disabled={!selectedPage}>
                        Mover
                      </button>
                      <button type="button" onClick={() => void handlePageDelete()} disabled={!selectedPage}>
                        Eliminar pagina
                      </button>
                    </div>
                  </label>
                </div>
                <span className="editor-help-text">
                  {pastingImage ? 'Procesando screenshot...' : 'Tip: pega screenshot con Ctrl/Cmd + V'}
                </span>
              </div>
              <section className="editor-richtext-shell" aria-label="Editor de contenido enriquecido">
                <div className="editor-format-toolbar">
                  <div className="editor-history-group" role="group" aria-label="Deshacer y rehacer">
                    <button
                      type="button"
                      onClick={() => applyEditorHistory('undo')}
                      title="Deshacer (Ctrl/Cmd+Z)"
                      aria-label="Deshacer"
                    >
                      Deshacer
                    </button>
                    <button
                      type="button"
                      onClick={() => applyEditorHistory('redo')}
                      title="Rehacer (Ctrl/Cmd+Shift+Z)"
                      aria-label="Rehacer"
                    >
                      Rehacer
                    </button>
                  </div>
                  <div className="editor-font-size-group" role="group" aria-label="Tamano del texto">
                    <button
                      type="button"
                      className="font-size-step"
                      onClick={() => applySelectionFontSizeStep(-3)}
                      title="Reducir 3 escalones de tamano (selecciona texto)"
                      aria-label="Reducir tamano del texto tres escalones"
                    >
                      A−
                    </button>
                    <button
                      type="button"
                      className="font-size-step"
                      onClick={() => applySelectionFontSizeStep(3)}
                      title="Aumentar 3 escalones de tamano (selecciona texto)"
                      aria-label="Aumentar tamano del texto tres escalones"
                    >
                      A+
                    </button>
                  </div>
                  <button type="button" onClick={() => applyEditorCommand('bold')} title="Negrita (Ctrl/Cmd+B)">
                    Negrita
                  </button>
                  <button type="button" onClick={() => applyEditorCommand('italic')} title="Cursiva (Ctrl/Cmd+I)">
                    Cursiva
                  </button>
                  <button
                    type="button"
                    onClick={() => applyEditorCommand('insertUnorderedList')}
                    title="Lista con viñetas"
                  >
                    Viñetas
                  </button>
                  <button
                    type="button"
                    onClick={() => applyEditorCommand('insertOrderedList')}
                    title="Lista numerada"
                  >
                    Numerada
                  </button>
                  <button
                    type="button"
                    onClick={applyEditorBlockquote}
                    title="Cita: aplicar o quitar (si ya estas en cita)"
                    aria-label="Alternar cita en el parrafo"
                  >
                    Cita
                  </button>
                  <button type="button" onClick={() => applyEditorCommand('underline')} title="Subrayado">
                    Subrayado
                  </button>
                  <button type="button" onClick={() => applyEditorCommand('strikeThrough')} title="Tachado">
                    Tachado
                  </button>
                  <div className="editor-color-palette" role="group" aria-label="Color del texto">
                    {TEXT_COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="color-swatch"
                        style={{ backgroundColor: color }}
                        onClick={() => applyEditorCommand('foreColor', color)}
                        title={`Color ${color}`}
                        aria-label={`Aplicar color ${color}`}
                      />
                    ))}
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
                  onPaste={(event) => {
                    void processImagePaste(event)
                  }}
                />
              </section>
              <nav className="page-nav" aria-label="Navegacion entre paginas">
                <button
                  type="button"
                  onClick={goToPrevPage}
                  disabled={!hasPrevPage}
                  title="Pagina anterior"
                >
                  <span aria-hidden="true">‹</span> Anterior
                </button>
                <span className="page-nav-status">
                  {selectedPageIndex >= 0
                    ? `Pagina ${selectedPageIndex + 1} de ${pages.length}`
                    : ''}
                </span>
                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={!hasNextPage}
                  title="Siguiente pagina"
                >
                  Siguiente <span aria-hidden="true">›</span>
                </button>
                {bookmarkOptions.length > 0 ? (
                  <label className="bookmark-nav">
                    <span>Bookmarks</span>
                    <select
                      className="page-combo"
                      value={isCurrentPageBookmarked && selectedPage ? selectedPage.id : ''}
                      onChange={(event) => {
                        const pageId = event.target.value
                        if (!pageId) {
                          return
                        }
                        void openBookmarkPage(pageId)
                      }}
                      aria-label="Ir a pagina con bookmark"
                    >
                      <option value="">Ir a bookmark...</option>
                      {bookmarkOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.pageTitle} · {option.notebookTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </nav>
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

function blockquoteContainingRange(root: HTMLElement, range: Range): HTMLElement | null {
  let n: Node | null = range.commonAncestorContainer
  if (n.nodeType === Node.TEXT_NODE) {
    n = n.parentNode
  }
  while (n && n !== root) {
    if (n.nodeName === 'BLOCKQUOTE') {
      return n as HTMLElement
    }
    n = n.parentNode
  }
  return null
}

function unwrapBlockquoteElement(bq: HTMLElement) {
  const parent = bq.parentNode
  if (!parent) {
    return
  }
  const fragment = document.createDocumentFragment()
  while (bq.firstChild) {
    fragment.appendChild(bq.firstChild)
  }
  parent.insertBefore(fragment, bq)
  parent.removeChild(bq)
}

/** Marca el inicio del rango (colapsado) para restaurar el cursor tras cambios DOM. */
function insertCaretMarkerBeforeCollapsed(range: Range): HTMLElement | null {
  try {
    const boundary = range.cloneRange()
    boundary.collapse(true)
    const marker = document.createElement('span')
    marker.setAttribute('data-editor-caret-restore', '')
    boundary.insertNode(marker)
    return marker
  } catch {
    return null
  }
}

function restoreCaretAtMarker(marker: HTMLElement, selection: Selection) {
  const parent = marker.parentNode
  if (!parent) {
    marker.remove()
    return
  }
  const idx = Array.prototype.indexOf.call(parent.childNodes, marker)
  marker.remove()
  const nextRange = document.createRange()
  const safeIdx = Math.min(Math.max(0, idx), parent.childNodes.length)
  nextRange.setStart(parent, safeIdx)
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)
}

function linkifyEditorAutoLinks(root: HTMLElement) {
  linkifyImgRefsInEditor(root)
  linkifyUrlsInEditor(root)
}

function normalizeAutoLinkUrl(raw: string): { display: string; href: string; tail: string } {
  const tailMatch = raw.match(/([.,;:!?)'»\]]+)$/u)
  const tail = tailMatch?.[1] ?? ''
  const display = tail ? raw.slice(0, -tail.length) : raw
  let href = display
  if (!/^https?:\/\//i.test(href)) {
    href = `https://${href}`
  }
  return { display, href, tail }
}

/** Wrap plain URLs in non-editable anchors (opens in new tab). Skips text inside any `<a>`. */
function linkifyUrlsInEditor(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!(node instanceof Text)) {
      continue
    }
    const text = node.textContent ?? ''
    if (!/\bhttps?:\/\/|\bwww\./i.test(text)) {
      continue
    }
    let el: HTMLElement | null = node.parentElement
    let insideAnchor = false
    while (el && el !== root) {
      if (el.tagName === 'A') {
        insideAnchor = true
        break
      }
      el = el.parentElement
    }
    if (!insideAnchor) {
      textNodes.push(node)
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? ''
    AUTO_LINK_URL_PATTERN.lastIndex = 0
    if (!AUTO_LINK_URL_PATTERN.test(text)) {
      continue
    }
    AUTO_LINK_URL_PATTERN.lastIndex = 0
    const frag = document.createDocumentFragment()
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = AUTO_LINK_URL_PATTERN.exec(text)) !== null) {
      const raw = match[0]
      const { display, href, tail } = normalizeAutoLinkUrl(raw)
      if (!display) {
        lastIndex = match.index + raw.length
        continue
      }
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
      }
      const anchor = document.createElement('a')
      anchor.className = EDITOR_AUTO_LINK_CLASS
      anchor.href = href
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.setAttribute('contenteditable', 'false')
      anchor.textContent = display
      frag.appendChild(anchor)
      if (tail) {
        frag.appendChild(document.createTextNode(tail))
      }
      lastIndex = match.index + raw.length
    }
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)))
    }
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}

/** Wrap plain `[img:token]` text in non-editable links for preview + click to open modal. */
function linkifyImgRefsInEditor(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node instanceof Text && node.textContent?.includes('[img:')) {
      let el: HTMLElement | null = node.parentElement
      let insideLink = false
      while (el && el !== root) {
        if (el.classList.contains('editor-img-ref')) {
          insideLink = true
          break
        }
        el = el.parentElement
      }
      if (!insideLink) {
        textNodes.push(node)
      }
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? ''
    IMG_REF_IN_TEXT_PATTERN.lastIndex = 0
    if (!IMG_REF_IN_TEXT_PATTERN.test(text)) {
      continue
    }
    IMG_REF_IN_TEXT_PATTERN.lastIndex = 0
    const frag = document.createDocumentFragment()
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = IMG_REF_IN_TEXT_PATTERN.exec(text)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
      }
      const token = match[1]
      const anchor = document.createElement('a')
      anchor.className = 'editor-img-ref'
      anchor.href = '#'
      anchor.dataset.imgRef = token
      anchor.setAttribute('contenteditable', 'false')
      anchor.textContent = `[img:${token}]`
      frag.appendChild(anchor)
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)))
    }
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}

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
