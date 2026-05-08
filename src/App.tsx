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
  updateNotebook,
  updatePage,
  updateUser,
} from './storage/repository'
import { buildSearchIndex, querySearch, type SearchResult } from './features/search/search'
import { createSalt, hashPin } from './features/session/session'

function App() {
  const [user, setUser] = useState<UserLocal | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')

  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [pages, setPages] = useState<Page[]>([])
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
  const [actionsOpen, setActionsOpen] = useState(false)
  const [notebooksHidden, setNotebooksHidden] = useState(false)
  const [pagesHidden, setPagesHidden] = useState(false)
  const secretResolverRef = useRef<((value: string | null) => void) | null>(null)

  const [notebooksCollapsed, setNotebooksCollapsed] = useState(false)
  const [pagesCollapsed, setPagesCollapsed] = useState(false)

  useEffect(() => {
    void bootstrap()
  }, [])

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
    const allAttachments = await listAllAttachments()
    setAttachments(allAttachments)

    const nextPageId = selectedPageId && allPages.some((page) => page.id === selectedPageId)
      ? selectedPageId
      : allPages[0]?.id ?? null
    setSelectedPageId(nextPageId)
  }

  async function handleNotebookCreate() {
    const notebookName = prompt('Nombre de la libreta')
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

    const pageName = prompt('Nombre de la pagina')
    if (pageName === null) {
      return
    }

    const page = await createPage(selectedNotebookId, pageName)
    await refreshPages(selectedNotebookId)
    setSelectedPageId(page.id)
  }

  async function handleNotebookBookmark(pageId: string) {
    if (!selectedNotebook) {
      return
    }
    const updated = { ...selectedNotebook, bookmarkPageId: pageId }
    await updateNotebook(updated)
    await refreshNotebooks()
  }

  async function handleNotebookRename() {
    if (!selectedNotebook) {
      return
    }
    const nextName = prompt('Nuevo nombre de la libreta', selectedNotebook.title)
    if (nextName === null) {
      return
    }
    const updated = { ...selectedNotebook, title: nextName.trim() || 'Nueva libreta' }
    await updateNotebook(updated)
    await refreshNotebooks()
  }

  async function handleNotebookDelete() {
    if (!selectedNotebook) {
      return
    }
    const confirmed = confirm(`Se eliminara la libreta "${selectedNotebook.title}" con sus paginas y adjuntos.`)
    if (!confirmed) {
      return
    }
    await deleteNotebook(selectedNotebook.id)
    setSelectedPageId(null)
    await refreshNotebooks()
  }

  async function handlePageDelete() {
    if (!selectedPage) {
      return
    }
    const confirmed = confirm(`Se eliminara la pagina "${selectedPage.title}" con sus adjuntos.`)
    if (!confirmed) {
      return
    }
    await deletePage(selectedPage.id)
    if (selectedNotebookId) {
      await refreshPages(selectedNotebookId)
    }
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

    setPastingImage(true)
    try {
      const processed = await downscaleImage(file)
      await addAttachment(selectedPageId, processed.blob, processed.width, processed.height)
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

  async function removeAttachment(attachmentId: string) {
    await deleteAttachment(attachmentId)
    if (selectedNotebookId) {
      await refreshPages(selectedNotebookId)
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
      alert((error as Error).message || 'No se pudo exportar el backup.')
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
        const shouldOverwrite = confirm(
          'Aceptar = reemplazar datos locales. Cancelar = intentar merge sin borrar lo actual.',
        )
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
          alert(`Error al importar backup: ${message}`)
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

  if (!user) {
    return <main className="app-shell">Inicializando...</main>
  }

  if (!unlocked) {
    return (
      <>
        <main className="app-shell lock-screen">
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
      </>
    )
  }

  return (
    <>
      <main className="app-shell">
        <header className="app-header">
          <h1>Libreta local</h1>
          <input
            className="search-input"
            placeholder="Busqueda global inteligente..."
            value={searchTerm}
            onChange={(event) => handleSearch(event.target.value)}
          />
          <button type="button" onClick={() => setActionsOpen((value) => !value)}>Acciones</button>
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

      <section className="layout">
        {!notebooksHidden ? (
          <aside
            className={`column notebooks${notebooksCollapsed ? ' collapsed' : ''}`}
            style={{ width: notebooksCollapsed ? '44px' : '240px' }}
          >
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
              <div className="column-title">
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
                <div className="column-actions">
                  <button type="button" onClick={handleNotebookCreate}>+ Nueva</button>
                  <button type="button" onClick={handleNotebookRename} disabled={!selectedNotebook}>Renombrar</button>
                  <button type="button" onClick={() => void handleNotebookDelete()} disabled={!selectedNotebook}>
                    Eliminar
                  </button>
                </div>
              </div>
              {notebooks.map((notebook) => (
                <button
                  key={notebook.id}
                  type="button"
                  className={notebook.id === selectedNotebookId ? 'active' : ''}
                  onClick={() => {
                    setSelectedNotebookId(notebook.id)
                    void refreshPages(notebook.id)
                  }}
                >
                  {notebook.title}
                </button>
              ))}
            </>
          )}
          </aside>
        ) : null}

        {!pagesHidden ? (
          <aside
            className={`column pages${pagesCollapsed ? ' collapsed' : ''}`}
            style={{ width: pagesCollapsed ? '44px' : '240px' }}
          >
          {pagesCollapsed ? (
            <button
              type="button"
              className="collapse-toggle collapsed-toggle"
              onClick={() => setPagesCollapsed(false)}
              aria-label="Expandir paginas"
              title="Expandir paginas"
            >
              <span className="collapsed-label">Paginas</span>
              <span aria-hidden="true">›</span>
            </button>
          ) : (
            <>
              <div className="column-title">
                <div className="column-title-left">
                  <button
                    type="button"
                    className="collapse-toggle"
                    onClick={() => setPagesCollapsed(true)}
                    aria-label="Colapsar paginas"
                    title="Colapsar paginas"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <h2>Paginas</h2>
                </div>
                <div className="column-actions">
                  <button type="button" onClick={handlePageCreate}>+ Nueva</button>
                  <button type="button" onClick={() => void handlePageDelete()} disabled={!selectedPage}>
                    Eliminar
                  </button>
                </div>
              </div>
              {pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  className={page.id === selectedPageId ? 'active' : ''}
                  onClick={() => setSelectedPageId(page.id)}
                >
                  <span>{page.title}</span>
                  {selectedNotebook?.bookmarkPageId === page.id ? <small>Bookmark</small> : null}
                </button>
              ))}
            </>
          )}
          </aside>
        ) : null}

        <article className="column editor">
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
                <button type="button" onClick={() => handleNotebookBookmark(selectedPage.id)}>
                  Marcar bookmark de libreta
                </button>
                <span>{pastingImage ? 'Procesando screenshot...' : 'Pega screenshot con Ctrl/Cmd + V'}</span>
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
              </nav>
              <section className="attachments">
                <h3>Imagenes de la pagina</h3>
                {selectedPageAttachments.length === 0 ? (
                  <p>No hay imagenes todavia.</p>
                ) : (
                  <div className="attachment-grid">
                    {selectedPageAttachments.map((attachment) => (
                      <figure key={attachment.id}>
                        <img src={URL.createObjectURL(attachment.blob)} alt="Adjunto pegado" />
                        <figcaption>
                          {(attachment.sizeBytes / 1024).toFixed(1)} KB
                          <button
                            type="button"
                            onClick={() => {
                              void removeAttachment(attachment.id)
                            }}
                          >
                            Eliminar
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </article>
      </section>
      </main>
      {renderSecretDialog()}
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
