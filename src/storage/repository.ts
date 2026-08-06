import { v4 as uuidv4 } from 'uuid'
import { db, type Attachment, type Page, type Space, type UserLocal } from './db'
import {
  attachmentFromExport,
  attachmentToExport,
  type BackupPayload,
} from '../features/backup/crypto'
import {
  decryptBlob,
  decryptField,
  encryptBlob,
  encryptField,
  isEncryptedBlob,
  isEncryptedField,
  isVaultUnlocked,
  unlockVaultWithPin,
} from '../features/session/vault'

const DEFAULT_SPACE_COLOR = '#4f46e5'
const USER_ID = 'local-user'

export async function ensureUser(): Promise<UserLocal> {
  const existing = await db.users.get(USER_ID)
  if (existing) {
    return existing
  }

  const user: UserLocal = {
    id: USER_ID,
    displayName: 'Usuario local',
    sessionConfig: null,
    createdAt: Date.now(),
  }
  await db.users.add(user)
  return user
}

export async function updateUser(user: UserLocal): Promise<void> {
  await db.users.put(user)
}

export async function listSpaces(): Promise<Space[]> {
  const spaces = await db.spaces.orderBy('updatedAt').reverse().toArray()
  const withArchived = spaces.map((space) => ({
    ...space,
    archived: space.archived === true,
  }))
  if (!isVaultUnlocked()) {
    return withArchived
  }
  return Promise.all(
    withArchived.map(async (space) => ({
      ...space,
      title: await decryptField(space.title),
    })),
  )
}

export async function listPagesBySpace(spaceId: string): Promise<Page[]> {
  const pages = await db.pages.where('spaceId').equals(spaceId).sortBy('updatedAt')
  if (!isVaultUnlocked()) {
    return pages
  }
  return Promise.all(pages.map(decryptPage))
}

/** Pagina descifrada por id; sirve para fusionar escrituras sin estado React obsoleto. */
export async function getPageById(pageId: string): Promise<Page | undefined> {
  const page = await db.pages.get(pageId)
  if (!page) {
    return undefined
  }
  if (!isVaultUnlocked()) {
    return page
  }
  return decryptPage(page)
}

export async function listAllPages(): Promise<Page[]> {
  const pages = await db.pages.toArray()
  if (!isVaultUnlocked()) {
    return pages
  }
  return Promise.all(pages.map(decryptPage))
}

export async function listAllAttachments(): Promise<Attachment[]> {
  const attachments = await db.attachments.toArray()
  if (!isVaultUnlocked()) {
    return attachments
  }
  return Promise.all(attachments.map(decryptAttachmentSafely))
}

export async function listAttachmentsByPage(pageId: string): Promise<Attachment[]> {
  const attachments = await db.attachments.where('pageId').equals(pageId).toArray()
  if (!isVaultUnlocked()) {
    return attachments
  }
  return Promise.all(attachments.map(decryptAttachmentSafely))
}

export async function createSpace(title: string): Promise<Space> {
  const now = Date.now()
  const plainTitle = title.trim() || 'Nuevo espacio'
  const space: Space = {
    id: uuidv4(),
    title: await encryptField(plainTitle),
    color: DEFAULT_SPACE_COLOR,
    pinned: false,
    archived: false,
    bookmarkPageId: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.spaces.add(space)

  const page = await createPage(space.id, 'Primera pagina')
  space.bookmarkPageId = page.id
  await db.spaces.put(space)

  return space
}

export async function updateSpace(space: Space): Promise<void> {
  const encryptedSpace: Space = {
    ...space,
    title: await encryptField(space.title),
    updatedAt: Date.now(),
  }
  await db.spaces.put(encryptedSpace)
}

export async function createPage(spaceId: string, title: string): Promise<Page> {
  const now = Date.now()
  const encryptedTitle = await encryptField(title.trim() || 'Nueva pagina')
  const encryptedContent = await encryptField('')
  const encryptedTags = await encryptField(JSON.stringify([]))
  const page: Page = {
    id: uuidv4(),
    spaceId,
    title: encryptedTitle,
    content: encryptedContent,
    tags: [encryptedTags],
    createdAt: now,
    updatedAt: now,
  }
  await db.pages.add(page)
  await db.spaces.update(spaceId, { updatedAt: now })
  return page
}

export type UpdatePageOptions = {
  /** When false, keeps page.updatedAt so manual sidebar order is unchanged (e.g. bookmark toggle). */
  touchUpdatedAt?: boolean
}

export async function updatePage(page: Page, options: UpdatePageOptions = {}): Promise<void> {
  const touchUpdatedAt = options.touchUpdatedAt ?? true
  const nextUpdatedAt = touchUpdatedAt ? Date.now() : page.updatedAt
  const encryptedTags = await encryptField(JSON.stringify(page.tags))
  const encryptedPage: Page = {
    ...page,
    title: await encryptField(page.title),
    content: await encryptField(page.content),
    tags: [encryptedTags],
    updatedAt: nextUpdatedAt,
  }
  await db.pages.put(encryptedPage)
  if (touchUpdatedAt) {
    await db.spaces.update(page.spaceId, { updatedAt: encryptedPage.updatedAt })
  }
}

export async function movePageBefore(
  spaceId: string,
  pageId: string,
  beforePageId: string | null,
): Promise<void> {
  await db.transaction('rw', db.pages, db.spaces, async () => {
    const pages = await db.pages.where('spaceId').equals(spaceId).sortBy('updatedAt')
    const movingPage = pages.find((page) => page.id === pageId)
    if (!movingPage) {
      return
    }

    const remainingPages = pages.filter((page) => page.id !== pageId)
    const targetIndex = beforePageId
      ? remainingPages.findIndex((page) => page.id === beforePageId)
      : remainingPages.length

    const insertAt = targetIndex >= 0 ? targetIndex : remainingPages.length
    const reordered = [...remainingPages]
    reordered.splice(insertAt, 0, movingPage)

    const base = Date.now()
    for (let index = 0; index < reordered.length; index += 1) {
      const page = reordered[index]
      page.updatedAt = base + index
    }

    await db.pages.bulkPut(reordered)
    await db.spaces.update(spaceId, { updatedAt: base + reordered.length })
  })
}

export async function addAttachment(
  pageId: string,
  blob: Blob,
  width: number,
  height: number,
  name?: string,
): Promise<Attachment> {
  const encryptedBlob = await encryptBlob(blob)
  const attachment: Attachment = {
    id: uuidv4(),
    pageId,
    name,
    mimeType: blob.type || 'image/png',
    sizeBytes: encryptedBlob.size,
    width,
    height,
    blob: encryptedBlob,
    createdAt: Date.now(),
  }
  await db.attachments.add(attachment)
  return {
    ...attachment,
    sizeBytes: blob.size,
    blob,
  }
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await db.attachments.delete(attachmentId)
}

export async function deletePage(pageId: string): Promise<void> {
  await db.transaction('rw', db.pages, db.attachments, db.spaces, async () => {
    const page = await db.pages.get(pageId)
    if (!page) {
      return
    }
    const space = await db.spaces.get(page.spaceId)

    await db.attachments.where('pageId').equals(pageId).delete()
    await db.pages.delete(pageId)
    await db.spaces.update(page.spaceId, {
      updatedAt: Date.now(),
      bookmarkPageId: space?.bookmarkPageId === pageId ? null : space?.bookmarkPageId ?? null,
    })
  })
}

export async function deleteSpace(spaceId: string): Promise<void> {
  await db.transaction('rw', db.spaces, db.pages, db.attachments, async () => {
    const pages = await db.pages.where('spaceId').equals(spaceId).toArray()
    const pageIds = pages.map((page) => page.id)

    for (const pageId of pageIds) {
      await db.attachments.where('pageId').equals(pageId).delete()
    }

    await db.pages.where('spaceId').equals(spaceId).delete()
    await db.spaces.delete(spaceId)
  })
}

export async function exportBackupPayload(): Promise<BackupPayload> {
  const [users, spaces, pages, attachments] = await Promise.all([
    db.users.toArray(),
    db.spaces.toArray(),
    db.pages.toArray(),
    db.attachments.toArray(),
  ])

  const attachmentExports = await Promise.all(attachments.map((attachment) => attachmentToExport(attachment)))

  return {
    version: 1,
    exportedAt: Date.now(),
    users,
    spaces,
    pages,
    attachments: attachmentExports,
  }
}

export async function importBackupPayload(payload: BackupPayload): Promise<void> {
  await importBackupPayloadWithMode(payload, 'replace')
}

export async function importBackupPayloadWithMode(
  payload: BackupPayload,
  mode: 'replace' | 'merge',
): Promise<void> {
  const spaces = normalizeBackupSpaces(payload)
  const pages = normalizeBackupPages(payload.pages)

  await db.transaction('rw', db.users, db.spaces, db.pages, db.attachments, async () => {
    if (mode === 'replace') {
      await Promise.all([db.users.clear(), db.spaces.clear(), db.pages.clear(), db.attachments.clear()])
    }

    if (payload.users.length > 0) {
      await db.users.bulkPut(payload.users)
    }
    if (spaces.length > 0) {
      await db.spaces.bulkPut(spaces)
    }
    if (pages.length > 0) {
      await db.pages.bulkPut(pages)
    }
    if (payload.attachments.length > 0) {
      await db.attachments.bulkPut(payload.attachments.map((attachment) => attachmentFromExport(attachment)))
    }
  })
}

function normalizeBackupSpaces(payload: BackupPayload): Space[] {
  const rawSpaces = payload.spaces ?? payload.notebooks ?? []
  return rawSpaces.map((space) => ({
    ...space,
    archived: space.archived === true,
  }))
}

function normalizeBackupPages(
  pages: Array<Page & { notebookId?: string }>,
): Page[] {
  return pages.map((page) => {
    const spaceId = page.spaceId || page.notebookId
    if (!spaceId) {
      throw new Error('Pagina de backup sin spaceId/notebookId.')
    }
    const { notebookId: _legacyNotebookId, ...rest } = page
    return {
      ...rest,
      spaceId,
    }
  })
}

export async function encryptExistingDataAtRest(): Promise<void> {
  if (!isVaultUnlocked()) {
    return
  }

  // Read + Web Crypto fuera de la transaccion IndexedDB: si await encrypt* ocurre
  // dentro de db.transaction(), la transaccion se puede cerrar antes del bulkPut
  // ("Transaction committed too early", ver Dexie docs).
  const [spaces, pages, attachments] = await Promise.all([
    db.spaces.toArray(),
    db.pages.toArray(),
    db.attachments.toArray(),
  ])

  const spaceUpdates = await Promise.all(
    spaces.map(async (space) => {
      if (isEncryptedField(space.title)) {
        return null
      }
      return {
        ...space,
        title: await encryptField(space.title),
      }
    }),
  )
  const spacesToWrite = spaceUpdates.filter((space): space is Space => space !== null)

  const pageUpdates = await Promise.all(
    pages.map(async (page) => {
      const tagsField = page.tags[0] ?? ''
      const alreadyEncrypted =
        isEncryptedField(page.title) && isEncryptedField(page.content) && isEncryptedField(tagsField)
      if (alreadyEncrypted) {
        return null
      }
      return {
        ...page,
        title: isEncryptedField(page.title) ? page.title : await encryptField(page.title),
        content: isEncryptedField(page.content) ? page.content : await encryptField(page.content),
        tags: [
          isEncryptedField(tagsField) ? tagsField : await encryptField(JSON.stringify(page.tags)),
        ],
      }
    }),
  )
  const pagesToWrite = pageUpdates.filter((page): page is Page => page !== null)

  const attachmentUpdates = await Promise.all(
    attachments.map(async (attachment) => {
      try {
        if (await isEncryptedBlob(attachment.blob)) {
          return null
        }
        return {
          ...attachment,
          blob: await encryptBlob(attachment.blob),
        }
      } catch {
        return null
      }
    }),
  )
  const attachmentsToWrite = attachmentUpdates.filter(
    (attachment): attachment is Attachment => attachment !== null,
  )

  if (
    spacesToWrite.length === 0 &&
    pagesToWrite.length === 0 &&
    attachmentsToWrite.length === 0
  ) {
    return
  }

  await db.transaction('rw', db.spaces, db.pages, db.attachments, async () => {
    if (spacesToWrite.length > 0) {
      await db.spaces.bulkPut(spacesToWrite)
    }
    if (pagesToWrite.length > 0) {
      await db.pages.bulkPut(pagesToWrite)
    }
    if (attachmentsToWrite.length > 0) {
      await db.attachments.bulkPut(attachmentsToWrite)
    }
  })
}

export async function rotateEncryptionPin(
  currentPin: string,
  currentSalt: string,
  currentIterations: number,
  newPin: string,
  newSalt: string,
  newIterations: number,
): Promise<void> {
  if (!isVaultUnlocked()) {
    throw new Error('Debes desbloquear la sesion antes de cambiar el PIN.')
  }

  const [spaces, pages, attachments] = await Promise.all([
    db.spaces.toArray(),
    db.pages.toArray(),
    db.attachments.toArray(),
  ])

  const plainSpaces = await Promise.all(
    spaces.map(async (space) => ({
      ...space,
      title: await decryptField(space.title),
    })),
  )
  const plainPages = await Promise.all(
    pages.map(async (page) => {
      const tagsRaw = page.tags[0] ?? '[]'
      const tagsJson = await decryptField(tagsRaw)
      return {
        ...page,
        title: await decryptField(page.title),
        content: await decryptField(page.content),
        tags: parseTags(tagsJson),
      }
    }),
  )
  const plainAttachments = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      blob: await decryptBlob(attachment.blob),
    })),
  )

  await unlockVaultWithPin(newPin, newSalt, newIterations)

  try {
    const encryptedSpaces = await Promise.all(
      plainSpaces.map(async (space) => ({
        ...space,
        title: await encryptField(space.title),
      })),
    )
    const encryptedPages = await Promise.all(
      plainPages.map(async (page) => ({
        ...page,
        title: await encryptField(page.title),
        content: await encryptField(page.content),
        tags: [await encryptField(JSON.stringify(page.tags))],
      })),
    )
    const encryptedAttachments = await Promise.all(
      plainAttachments.map(async (attachment) => ({
        ...attachment,
        blob: await encryptBlob(attachment.blob),
      })),
    )

    await db.transaction('rw', db.spaces, db.pages, db.attachments, async () => {
      await db.spaces.bulkPut(encryptedSpaces)
      await db.pages.bulkPut(encryptedPages)
      await db.attachments.bulkPut(encryptedAttachments)
    })
  } catch (error) {
    await unlockVaultWithPin(currentPin, currentSalt, currentIterations)
    throw error
  }
}

async function decryptPage(page: Page): Promise<Page> {
  const tagsRaw = page.tags[0] ?? '[]'
  const tagsJson = await decryptField(tagsRaw)
  return {
    ...page,
    title: await decryptField(page.title),
    content: await decryptField(page.content),
    tags: parseTags(tagsJson),
  }
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

async function decryptAttachment(attachment: Attachment): Promise<Attachment> {
  const plainBlob = await decryptBlob(attachment.blob)
  return {
    ...attachment,
    blob: new Blob([plainBlob], { type: attachment.mimeType || plainBlob.type || 'application/octet-stream' }),
  }
}

async function decryptAttachmentSafely(attachment: Attachment): Promise<Attachment> {
  try {
    return await decryptAttachment(attachment)
  } catch {
    return attachment
  }
}
