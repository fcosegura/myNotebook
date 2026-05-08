import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
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

const BOOKMARK_TAG = 'bookmark'

function App() {
  const [user, setUser] = useState<UserLocal | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')

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
  const [notebooksHidden, setNotebooksHidden] = useState(false)
  const [pagesHidden, setPagesHidden] = useState(false)
  const [densityMode, setDensityMode] = useState<'compact' | 'comfortable'>('comfortable')
  const [notebookMenuId, setNotebookMenuId] = useState<string | null>(null)
  const [imageModalAttachment, setImageModalAttachment] = useState<Attachment | null>(null)
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null)
  const secretResolverRef = useRef<((value: string | null) => void) | null>(null)
  const appDialogResolverRef = useRef<((value: unknown) => void) | null>(null)

  const [notebooksCollapsed, setNotebooksCollapsed] = useState(false)

  useEffect(() => {
    void bootstrap()
  }, [])

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

  const selectedNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === selectedNotebookId) ?? null,
    [notebooks, selectedNotebookId],
  )

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, selectedPageId],
  )

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
    const localUser = await ensureUser()
    setUser(localUser)
    // Always show lock/setup screen on app entry.
    setUnlocked(false)
    await refreshNotebooks()
  }

  async function refreshNotebooks() {
    const allNotebooks = await listNotebooks()
    setNotebooks(allNotebooks)

    if (allNotebooks.length === 0) {
      const notebook = await createNotebook('Mi libreta')
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
  }

  async function handlePageBookmark() {
    if (!selectedPage || !selectedNotebookId) {
      return
    }
    const hasBookmark = selectedPage.tags.includes(BOOKMARK_TAG)
    const updatedTags = hasBookmark
      ? selectedPage.tags.filter((tag) => tag !== BOOKMARK_TAG)
      : [...selectedPage.tags, BOOKMARK_TAG]
    await updatePage({ ...selectedPage, tags: updatedTags })
    await refreshPages(selectedNotebookId)
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
  }

  async function handlePageFieldChange<K extends keyof Page>(key: K, value: Page[K]) {
    if (!selectedPage) {
      return
    }
    const updatedPage = { ...selectedPage, [key]: value }
    await updatePage(updatedPage)
    if (selectedNotebookId) {
      await refreshPages(selectedNotebookId)
    }
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
    setUser(updatedUser)
    setPinInput('')
    setPinError('')
    setUnlocked(true)
  }

  async function handleUnlock() {
    if (!user?.sessionConfig) {
      return
    }
    const hash = await hashPin(pinInput, user.sessionConfig.salt, user.sessionConfig.iterations)
    if (hash !== user.sessionConfig.pinHash) {
      setPinError('PIN incorrecto.')
      return
    }
    setUnlocked(true)
    setPinInput('')
    setPinError('')
  }

  async function processImagePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!selectedPageId || !selectedPage) {
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

    setPastingImage(true)
    try {
      const processed = await downscaleImage(file)
      const attachmentName = buildAttachmentName(selectedPageAttachments.length + 1)
      const attachment = await addAttachment(
        selectedPageId,
        processed.blob,
        processed.width,
        processed.height,
        attachmentName,
      )
      const referenceLine = `\n[img:${attachment.name ?? attachment.id}]`
      const updatedPage = {
        ...selectedPage,
        content: `${selectedPage.content}${selectedPage.content.endsWith('\n') || !selectedPage.content ? '' : '\n'}${referenceLine.trimStart()}`,
      }
      await updatePage(updatedPage)
      if (selectedNotebookId) {
        await refreshPages(selectedNotebookId)
      }
    } finally {
      setPastingImage(false)
    }
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
            <button type="button" onClick={() => void handleExportEncryptedBackup()}>Exportar cifrado</button>
            <button type="button" onClick={() => void handleImportEncryptedBackup()}>Importar cifrado</button>
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
              <textarea
                value={selectedPage.content}
                onChange={(event) => {
                  void handlePageFieldChange('content', event.target.value)
                }}
                onPaste={(event) => {
                  void processImagePaste(event)
                }}
                placeholder="Escribe tu nota aqui. Puedes pegar imagenes desde portapapeles."
              />
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
