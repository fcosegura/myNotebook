import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addAttachment,
  createSpace,
  createPage,
  deleteAttachment,
  deleteSpace,
  deletePage,
  encryptExistingDataAtRest,
  ensureUser,
  exportBackupPayload,
  getPageById,
  importBackupPayloadWithMode,
  listAllAttachments,
  listAttachmentsByPage,
  listSpaces,
  listPagesBySpace,
  movePageBefore,
  updateSpace,
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

  it('createSpace persiste espacio, pagina inicial y bookmark', async () => {
    const space = await createSpace('  Mi espacio  ')
    const stored = await db.spaces.get(space.id)
    const pages = await listPagesBySpace(space.id)

    expect(stored).toBeDefined()
    expect(pages).toHaveLength(1)
    expect(stored?.bookmarkPageId).toBe(pages[0]?.id)

    const listed = await listSpaces()
    expect(listed.some((item) => item.id === space.id)).toBe(true)
    expect(listed.find((item) => item.id === space.id)?.title).toBe('Mi espacio')
  })

  it('updatePage y getPageById conservan titulo y contenido', async () => {
    const space = await createSpace('Espacio')
    const page = await createPage(space.id, 'Borrador')

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
    const space = await createSpace('Bookmark orden')
    const [firstPage] = await listPagesBySpace(space.id)
    const secondPage = await createPage(space.id, 'Segunda')
    const thirdPage = await createPage(space.id, 'Tercera')

    const orderBefore = (await listPagesBySpace(space.id)).map((page) => page.id)
    expect(orderBefore).toEqual([firstPage.id, secondPage.id, thirdPage.id])

    await updatePage({ ...firstPage, tags: ['bookmark'] }, { touchUpdatedAt: false })

    const orderAfter = (await listPagesBySpace(space.id)).map((page) => page.id)
    expect(orderAfter).toEqual(orderBefore)
  })

  it('movePageBefore reordena paginas por updatedAt', async () => {
    const space = await createSpace('Orden')
    const pageA = await createPage(space.id, 'A')
    const pageB = await createPage(space.id, 'B')
    const pageC = await createPage(space.id, 'C')

    await movePageBefore(space.id, pageC.id, pageA.id)

    const ordered = (await listPagesBySpace(space.id)).map((page) => page.id)
    const indexA = ordered.indexOf(pageA.id)
    const indexB = ordered.indexOf(pageB.id)
    const indexC = ordered.indexOf(pageC.id)
    expect(indexC).toBeLessThan(indexA)
    expect(indexA).toBeLessThan(indexB)
  })

  it('addAttachment y deleteAttachment persisten blobs cifrados', async () => {
    const space = await createSpace('Adjuntos')
    const page = await createPage(space.id, 'Pagina')
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
    const space = await createSpace('Eliminar pagina')
    const page = await createPage(space.id, 'Temporal')
    const blob = new Blob(['x'], { type: 'image/png' })
    await addAttachment(page.id, blob, 1, 1)

    await db.spaces.update(space.id, { bookmarkPageId: page.id })
    await deletePage(page.id)

    expect(await db.pages.get(page.id)).toBeUndefined()
    expect(await db.attachments.where('pageId').equals(page.id).count()).toBe(0)

    const updatedSpace = await db.spaces.get(space.id)
    expect(updatedSpace?.bookmarkPageId).toBeNull()
  })

  it('deleteSpace elimina paginas y adjuntos en cascada', async () => {
    const space = await createSpace('Eliminar espacio')
    const page = await createPage(space.id, 'Pagina')
    await addAttachment(page.id, new Blob(['x'], { type: 'image/png' }), 1, 1)

    await deleteSpace(space.id)

    expect(await db.spaces.get(space.id)).toBeUndefined()
    expect(await db.pages.where('spaceId').equals(space.id).count()).toBe(0)
    expect(await db.attachments.where('pageId').equals(page.id).count()).toBe(0)
  })

  it('listSpaces normaliza archived=false en registros antiguos', async () => {
    const space = await createSpace('Legacy')
    await db.spaces.update(space.id, { archived: undefined as unknown as boolean })

    const listed = await listSpaces()
    expect(listed.find((item) => item.id === space.id)?.archived).toBe(false)
  })

  it('exportBackupPayload e import replace restauran el estado completo', async () => {
    const space = await createSpace('Backup')
    const page = await createPage(space.id, 'Pagina backup')
    await updatePage({ ...page, title: 'Actualizada', content: 'Texto', tags: ['tag'] })
    await updateSpace({ ...space, title: 'Backup renombrado', pinned: true })

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
    expect(await db.spaces.count()).toBe(1)
    expect(await db.pages.count()).toBe(2)

    const restoredSpace = (await listSpaces())[0]
    expect(restoredSpace?.title).toBe('Backup renombrado')
    expect(restoredSpace?.pinned).toBe(true)

    const restoredPages = await listPagesBySpace(restoredSpace!.id)
    const restoredPage = restoredPages.find((item) => item.title === 'Actualizada')
    expect(restoredPage?.content).toBe('Texto')
    expect(restoredPage?.tags).toEqual(['tag'])
  })

  it('import acepta backup legacy con notebooks y notebookId', async () => {
    const legacyPayload = {
      version: 1,
      exportedAt: Date.now(),
      users: [],
      notebooks: [
        {
          id: 'legacy-space-1',
          title: 'enc:v1:legacy',
          color: '#4f46e5',
          pinned: false,
          archived: false,
          bookmarkPageId: 'legacy-page-1',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      pages: [
        {
          id: 'legacy-page-1',
          notebookId: 'legacy-space-1',
          title: 'enc:v1:page',
          content: 'enc:v1:body',
          tags: ['enc:v1:[]'],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      attachments: [],
    }

    await importBackupPayloadWithMode(legacyPayload as never, 'replace')

    expect(await db.spaces.count()).toBe(1)
    expect(await db.spaces.get('legacy-space-1')).toBeDefined()
    const page = await db.pages.get('legacy-page-1')
    expect(page?.spaceId).toBe('legacy-space-1')
    expect((page as { notebookId?: string } | undefined)?.notebookId).toBeUndefined()
  })

  it('import merge combina datos sin borrar existentes', async () => {
    await createSpace('Local')
    const snapshot = await exportBackupPayload()

    await resetDatabase()
    await unlockTestVault()
    await createSpace('Nueva local')
    await importBackupPayloadWithMode(snapshot, 'merge')

    const titles = (await listSpaces()).map((space) => space.title)
    expect(titles).toContain('Nueva local')
    expect(titles).toContain('Local')
    expect(await db.spaces.count()).toBe(2)
  })

  describe('cerrar sesion (logout / lockVault)', () => {
    it('lockVault no elimina filas de IndexedDB', async () => {
      const space = await createSpace('Tras logout')
      await createPage(space.id, 'Nota')

      const counts = {
        users: await db.users.count(),
        spaces: await db.spaces.count(),
        pages: await db.pages.count(),
      }

      lockVault()
      expect(isVaultUnlocked()).toBe(false)

      expect(await db.users.count()).toBe(counts.users)
      expect(await db.spaces.count()).toBe(counts.spaces)
      expect(await db.pages.count()).toBe(counts.pages)
    })

    it('con sesion bloqueada los datos siguen cifrados en disco', async () => {
      const space = await createSpace('Bloqueada')
      const page = await createPage(space.id, 'Privada')
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
      const space = await createSpace('Re-login')
      const page = await createPage(space.id, 'Nota')
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
      expect((await listSpaces()).find((item) => item.id === space.id)?.title).toBe('Re-login')
    })

    it('simula logout: espera cola de guardado y conserva el ultimo contenido', async () => {
      const space = await createSpace('Cola logout')
      const page = await createPage(space.id, 'Borrador')
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
      const space = await createSpace('Logout prematuro')
      const page = await createPage(space.id, 'Pagina')
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
      const space = await createSpace('Migracion')
      const page = await createPage(space.id, 'Segura')
      await updatePage({
        ...(await getPageById(page.id))!,
        content: '<p>No debe perderse</p>',
        tags: [],
      })

      lockVault()
      await simulateLoginAfterLogout()
      await encryptExistingDataAtRest()

      expect((await getPageById(page.id))?.content).toBe('<p>No debe perderse</p>')
      expect((await listPagesBySpace(space.id)).length).toBeGreaterThanOrEqual(2)
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
    const space = await createSpace('Reapertura')
    const page = await createPage(space.id, 'Persistente')
    await updatePage({ ...page, title: 'Clave', content: 'Secreto', tags: [] })

    lockVault()
    await db.close()
    await db.open()
    await unlockTestVault()

    const reloaded = await getPageById(page.id)
    expect(reloaded?.title).toBe('Clave')
    expect(reloaded?.content).toBe('Secreto')

    const spaces = await listSpaces()
    expect(spaces.find((item) => item.id === space.id)?.title).toBe('Reapertura')
  })
})
