import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addAttachment,
  createNotebook,
  createPage,
  deleteAttachment,
  deleteNotebook,
  deletePage,
  encryptExistingDataAtRest,
  ensureUser,
  exportBackupPayload,
  getPageById,
  importBackupPayloadWithMode,
  listAllAttachments,
  listAttachmentsByPage,
  listNotebooks,
  listPagesByNotebook,
  movePageBefore,
  updateNotebook,
  updatePage,
  updateUser,
} from './repository'
import { hashPin } from '../features/session/session'
import { isVaultUnlocked, lockVault, unlockVaultWithPin } from '../features/session/vault'

const TEST_PIN = 'test-pin-1234'
const TEST_SALT = 'ci-test-salt'
const TEST_ITERATIONS = 1_000

async function resetDatabase(): Promise<void> {
  lockVault()
  await db.delete()
  await db.open()
}

async function unlockTestVault(): Promise<void> {
  await unlockVaultWithPin(TEST_PIN, TEST_SALT, TEST_ITERATIONS)
}

/** Replica pagePersistChainRef + handleLogout de App.tsx */
function createPagePersistChain() {
  let chain = Promise.resolve()
  return {
    enqueue(task: () => Promise<void>) {
      chain = chain.then(task)
      return chain
    },
    async flush() {
      await chain
    },
  }
}

/** Orden de handleUnlock tras introducir el PIN */
async function simulateLoginAfterLogout(): Promise<void> {
  await unlockTestVault()
  await encryptExistingDataAtRest()
}

describe('persistencia (Dexie / IndexedDB)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await unlockTestVault()
  })

  afterEach(() => {
    lockVault()
  })

  it('ensureUser crea un unico usuario local', async () => {
    const first = await ensureUser()
    const second = await ensureUser()

    expect(first.id).toBe('local-user')
    expect(second.id).toBe(first.id)
    expect(await db.users.count()).toBe(1)
  })

  it('createNotebook persiste libreta, pagina inicial y bookmark', async () => {
    const notebook = await createNotebook('  Mi libreta  ')
    const stored = await db.notebooks.get(notebook.id)
    const pages = await listPagesByNotebook(notebook.id)

    expect(stored).toBeDefined()
    expect(pages).toHaveLength(1)
    expect(stored?.bookmarkPageId).toBe(pages[0]?.id)

    const listed = await listNotebooks()
    expect(listed.some((item) => item.id === notebook.id)).toBe(true)
    expect(listed.find((item) => item.id === notebook.id)?.title).toBe('Mi libreta')
  })

  it('updatePage y getPageById conservan titulo y contenido', async () => {
    const notebook = await createNotebook('Libreta')
    const page = await createPage(notebook.id, 'Borrador')

    await updatePage({
      ...page,
      title: 'Titulo final',
      content: 'Contenido largo',
      tags: ['alpha', 'beta'],
    })

    const loaded = await getPageById(page.id)
    expect(loaded?.title).toBe('Titulo final')
    expect(loaded?.content).toBe('Contenido largo')
    expect(loaded?.tags).toEqual(['alpha', 'beta'])
  })

  it('updatePage sin touchUpdatedAt no altera el orden de paginas', async () => {
    const notebook = await createNotebook('Bookmark orden')
    const [firstPage] = await listPagesByNotebook(notebook.id)
    await new Promise((r) => setTimeout(r, 2))
    const secondPage = await createPage(notebook.id, 'Segunda')
    await new Promise((r) => setTimeout(r, 2))
    const thirdPage = await createPage(notebook.id, 'Tercera')

    const orderBefore = (await listPagesByNotebook(notebook.id)).map((page) => page.id)
    expect(orderBefore).toEqual([firstPage.id, secondPage.id, thirdPage.id])

    await updatePage({ ...firstPage, tags: ['bookmark'] }, { touchUpdatedAt: false })

    const orderAfter = (await listPagesByNotebook(notebook.id)).map((page) => page.id)
    expect(orderAfter).toEqual(orderBefore)
  })

  it('movePageBefore reordena paginas por updatedAt', async () => {
    const notebook = await createNotebook('Orden')
    await new Promise((r) => setTimeout(r, 2))
    const pageA = await createPage(notebook.id, 'A')
    await new Promise((r) => setTimeout(r, 2))
    const pageB = await createPage(notebook.id, 'B')
    await new Promise((r) => setTimeout(r, 2))
    const pageC = await createPage(notebook.id, 'C')

    await movePageBefore(notebook.id, pageC.id, pageA.id)

    const ordered = (await listPagesByNotebook(notebook.id)).map((page) => page.id)
    const indexA = ordered.indexOf(pageA.id)
    const indexB = ordered.indexOf(pageB.id)
    const indexC = ordered.indexOf(pageC.id)
    expect(indexC).toBeLessThan(indexA)
    expect(indexA).toBeLessThan(indexB)
  })

  it('addAttachment y deleteAttachment persisten blobs cifrados', async () => {
    const notebook = await createNotebook('Adjuntos')
    const page = await createPage(notebook.id, 'Pagina')
    const blob = new Blob(['pixel-data'], { type: 'image/png' })

    const attachment = await addAttachment(page.id, blob, 100, 50, 'foto.png')
    expect((await listAttachmentsByPage(page.id))).toHaveLength(1)

    const raw = await db.attachments.get(attachment.id)
    expect(raw?.blob).toBeDefined()
    expect(raw?.blob.type).toBe('application/octet-stream')

    await deleteAttachment(attachment.id)
    expect(await listAllAttachments()).toHaveLength(0)
  })

  it('deletePage elimina adjuntos y limpia bookmark si aplica', async () => {
    const notebook = await createNotebook('Eliminar pagina')
    const page = await createPage(notebook.id, 'Temporal')
    const blob = new Blob(['x'], { type: 'image/png' })
    await addAttachment(page.id, blob, 1, 1)

    await db.notebooks.update(notebook.id, { bookmarkPageId: page.id })
    await deletePage(page.id)

    expect(await db.pages.get(page.id)).toBeUndefined()
    expect(await db.attachments.where('pageId').equals(page.id).count()).toBe(0)

    const updatedNotebook = await db.notebooks.get(notebook.id)
    expect(updatedNotebook?.bookmarkPageId).toBeNull()
  })

  it('deleteNotebook elimina paginas y adjuntos en cascada', async () => {
    const notebook = await createNotebook('Eliminar libreta')
    const page = await createPage(notebook.id, 'Pagina')
    await addAttachment(page.id, new Blob(['x'], { type: 'image/png' }), 1, 1)

    await deleteNotebook(notebook.id)

    expect(await db.notebooks.get(notebook.id)).toBeUndefined()
    expect(await db.pages.where('notebookId').equals(notebook.id).count()).toBe(0)
    expect(await db.attachments.where('pageId').equals(page.id).count()).toBe(0)
  })

  it('listNotebooks normaliza archived=false en registros antiguos', async () => {
    const notebook = await createNotebook('Legacy')
    await db.notebooks.update(notebook.id, { archived: undefined as unknown as boolean })

    const listed = await listNotebooks()
    expect(listed.find((item) => item.id === notebook.id)?.archived).toBe(false)
  })

  it('exportBackupPayload e import replace restauran el estado completo', async () => {
    const notebook = await createNotebook('Backup')
    const page = await createPage(notebook.id, 'Pagina backup')
    await updatePage({ ...page, title: 'Actualizada', content: 'Texto', tags: ['tag'] })
    await updateNotebook({ ...notebook, title: 'Backup renombrado', pinned: true })

    const user = await ensureUser()
    await updateUser({
      ...user,
      displayName: 'Usuario CI',
      sessionConfig: {
        pinHash: await hashPin(TEST_PIN, TEST_SALT, TEST_ITERATIONS),
        salt: TEST_SALT,
        iterations: TEST_ITERATIONS,
      },
    })

    const snapshot = await exportBackupPayload()
    await resetDatabase()
    await unlockTestVault()
    await importBackupPayloadWithMode(snapshot, 'replace')

    expect(await db.users.count()).toBe(1)
    expect(await db.notebooks.count()).toBe(1)
    expect(await db.pages.count()).toBe(2)

    const restoredNotebook = (await listNotebooks())[0]
    expect(restoredNotebook?.title).toBe('Backup renombrado')
    expect(restoredNotebook?.pinned).toBe(true)

    const restoredPages = await listPagesByNotebook(restoredNotebook!.id)
    const restoredPage = restoredPages.find((item) => item.title === 'Actualizada')
    expect(restoredPage?.content).toBe('Texto')
    expect(restoredPage?.tags).toEqual(['tag'])
  })

  it('import merge combina datos sin borrar existentes', async () => {
    await createNotebook('Local')
    const snapshot = await exportBackupPayload()

    await resetDatabase()
    await unlockTestVault()
    await createNotebook('Nueva local')
    await importBackupPayloadWithMode(snapshot, 'merge')

    const titles = (await listNotebooks()).map((notebook) => notebook.title)
    expect(titles).toContain('Nueva local')
    expect(titles).toContain('Local')
    expect(await db.notebooks.count()).toBe(2)
  })

  describe('cerrar sesion (logout / lockVault)', () => {
    it('lockVault no elimina filas de IndexedDB', async () => {
      const notebook = await createNotebook('Tras logout')
      await createPage(notebook.id, 'Nota')

      const counts = {
        users: await db.users.count(),
        notebooks: await db.notebooks.count(),
        pages: await db.pages.count(),
      }

      lockVault()
      expect(isVaultUnlocked()).toBe(false)

      expect(await db.users.count()).toBe(counts.users)
      expect(await db.notebooks.count()).toBe(counts.notebooks)
      expect(await db.pages.count()).toBe(counts.pages)
    })

    it('con sesion bloqueada los datos siguen cifrados en disco', async () => {
      const notebook = await createNotebook('Bloqueada')
      const page = await createPage(notebook.id, 'Privada')
      await updatePage({
        ...(await getPageById(page.id))!,
        content: 'Texto privado',
        tags: [],
      })

      lockVault()

      const lockedView = await getPageById(page.id)
      expect(lockedView?.content).not.toBe('Texto privado')
      expect(lockedView?.content.startsWith('enc:v1:')).toBe(true)
      expect(await db.pages.get(page.id)).toBeDefined()
    })

    it('tras logout y login el contenido de la nota se recupera intacto', async () => {
      const notebook = await createNotebook('Re-login')
      const page = await createPage(notebook.id, 'Nota')
      const savedHtml = '<p>Texto guardado antes de cerrar sesion</p>'

      await updatePage({
        ...(await getPageById(page.id))!,
        title: 'Nota importante',
        content: savedHtml,
        tags: ['trabajo'],
      })

      lockVault()
      await simulateLoginAfterLogout()

      const restored = await getPageById(page.id)
      expect(restored?.title).toBe('Nota importante')
      expect(restored?.content).toBe(savedHtml)
      expect(restored?.tags).toEqual(['trabajo'])
      expect((await listNotebooks()).find((item) => item.id === notebook.id)?.title).toBe('Re-login')
    })

    it('simula logout: espera cola de guardado y conserva el ultimo contenido', async () => {
      const notebook = await createNotebook('Cola logout')
      const page = await createPage(notebook.id, 'Borrador')
      const persist = createPagePersistChain()

      await updatePage({
        ...(await getPageById(page.id))!,
        content: 'Version inicial',
        tags: [],
      })

      void persist.enqueue(async () => {
        const fresh = await getPageById(page.id)
        if (!fresh) {
          return
        }
        await updatePage({ ...fresh, content: '<p>Editado justo antes de logout</p>' })
      })

      await persist.flush()
      lockVault()
      await simulateLoginAfterLogout()

      expect((await getPageById(page.id))?.content).toBe('<p>Editado justo antes de logout</p>')
      expect(await db.pages.count()).toBeGreaterThanOrEqual(2)
    })

    it('logout sin esperar la cola deja el contenido anterior hasta que acabe el guardado', async () => {
      const notebook = await createNotebook('Logout prematuro')
      const page = await createPage(notebook.id, 'Pagina')
      await updatePage({
        ...(await getPageById(page.id))!,
        content: 'Contenido estable',
        tags: [],
      })

      let releaseSlowUpdate: () => void = () => {}
      const slowUpdateGate = new Promise<void>((resolve) => {
        releaseSlowUpdate = resolve
      })

      const persist = createPagePersistChain()
      const pendingSave = persist.enqueue(async () => {
        await slowUpdateGate
        const fresh = await getPageById(page.id)
        if (!fresh) {
          return
        }
        await updatePage({ ...fresh, content: 'Cambio que llega tarde' })
      })

      lockVault()
      await unlockTestVault()
      expect((await getPageById(page.id))?.content).toBe('Contenido estable')

      releaseSlowUpdate()
      await pendingSave
      expect((await getPageById(page.id))?.content).toBe('Cambio que llega tarde')

      lockVault()
      await simulateLoginAfterLogout()
      expect((await getPageById(page.id))?.content).toBe('Cambio que llega tarde')
    })

    it('login post-logout con encryptExistingDataAtRest no vacia notas existentes', async () => {
      const notebook = await createNotebook('Migracion')
      const page = await createPage(notebook.id, 'Segura')
      await updatePage({
        ...(await getPageById(page.id))!,
        content: '<p>No debe perderse</p>',
        tags: [],
      })

      lockVault()
      await simulateLoginAfterLogout()
      await encryptExistingDataAtRest()

      expect((await getPageById(page.id))?.content).toBe('<p>No debe perderse</p>')
      expect((await listPagesByNotebook(notebook.id)).length).toBeGreaterThanOrEqual(2)
    })

    it('sessionConfig del usuario persiste tras cerrar sesion', async () => {
      const user = await ensureUser()
      await updateUser({
        ...user,
        sessionConfig: {
          pinHash: await hashPin(TEST_PIN, TEST_SALT, TEST_ITERATIONS),
          salt: TEST_SALT,
          iterations: TEST_ITERATIONS,
        },
      })

      lockVault()
      await db.close()
      await db.open()

      const reloaded = await db.users.get('local-user')
      expect(reloaded?.sessionConfig?.salt).toBe(TEST_SALT)
      expect(reloaded?.sessionConfig?.pinHash).toBe(
        (await hashPin(TEST_PIN, TEST_SALT, TEST_ITERATIONS)),
      )
    })
  })

  it('los datos cifrados sobreviven a cerrar y reabrir la base', async () => {
    const notebook = await createNotebook('Reapertura')
    const page = await createPage(notebook.id, 'Persistente')
    await updatePage({ ...page, title: 'Clave', content: 'Secreto', tags: [] })

    lockVault()
    await db.close()
    await db.open()
    await unlockTestVault()

    const reloaded = await getPageById(page.id)
    expect(reloaded?.title).toBe('Clave')
    expect(reloaded?.content).toBe('Secreto')

    const notebooks = await listNotebooks()
    expect(notebooks.find((item) => item.id === notebook.id)?.title).toBe('Reapertura')
  })
})
