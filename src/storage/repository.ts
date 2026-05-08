import { v4 as uuidv4 } from 'uuid'
import { db, type Attachment, type Notebook, type Page, type UserLocal } from './db'
import {
  attachmentFromExport,
  attachmentToExport,
  type BackupPayload,
} from '../features/backup/crypto'

const DEFAULT_NOTEBOOK_COLOR = '#4f46e5'
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

export async function listNotebooks(): Promise<Notebook[]> {
  return db.notebooks.orderBy('updatedAt').reverse().toArray()
}

export async function listPagesByNotebook(notebookId: string): Promise<Page[]> {
  return db.pages.where('notebookId').equals(notebookId).sortBy('updatedAt')
}

export async function listAllPages(): Promise<Page[]> {
  return db.pages.toArray()
}

export async function listAllAttachments(): Promise<Attachment[]> {
  return db.attachments.toArray()
}

export async function listAttachmentsByPage(pageId: string): Promise<Attachment[]> {
  return db.attachments.where('pageId').equals(pageId).toArray()
}

export async function createNotebook(title: string): Promise<Notebook> {
  const now = Date.now()
  const notebook: Notebook = {
    id: uuidv4(),
    title: title.trim() || 'Nueva libreta',
    color: DEFAULT_NOTEBOOK_COLOR,
    pinned: false,
    bookmarkPageId: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.notebooks.add(notebook)

  const page = await createPage(notebook.id, 'Primera pagina')
  notebook.bookmarkPageId = page.id
  await db.notebooks.put(notebook)

  return notebook
}

export async function updateNotebook(notebook: Notebook): Promise<void> {
  notebook.updatedAt = Date.now()
  await db.notebooks.put(notebook)
}

export async function createPage(notebookId: string, title: string): Promise<Page> {
  const now = Date.now()
  const page: Page = {
    id: uuidv4(),
    notebookId,
    title: title.trim() || 'Nueva pagina',
    content: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
  await db.pages.add(page)
  await db.notebooks.update(notebookId, { updatedAt: now })
  return page
}

export async function updatePage(page: Page): Promise<void> {
  page.updatedAt = Date.now()
  await db.pages.put(page)
  await db.notebooks.update(page.notebookId, { updatedAt: page.updatedAt })
}

export async function addAttachment(
  pageId: string,
  blob: Blob,
  width: number,
  height: number,
  name?: string,
): Promise<Attachment> {
  const attachment: Attachment = {
    id: uuidv4(),
    pageId,
    name,
    mimeType: blob.type || 'image/png',
    sizeBytes: blob.size,
    width,
    height,
    blob,
    createdAt: Date.now(),
  }
  await db.attachments.add(attachment)
  return attachment
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await db.attachments.delete(attachmentId)
}

export async function deletePage(pageId: string): Promise<void> {
  await db.transaction('rw', db.pages, db.attachments, db.notebooks, async () => {
    const page = await db.pages.get(pageId)
    if (!page) {
      return
    }
    const notebook = await db.notebooks.get(page.notebookId)

    await db.attachments.where('pageId').equals(pageId).delete()
    await db.pages.delete(pageId)
    await db.notebooks.update(page.notebookId, {
      updatedAt: Date.now(),
      bookmarkPageId: notebook?.bookmarkPageId === pageId ? null : notebook?.bookmarkPageId ?? null,
    })
  })
}

export async function deleteNotebook(notebookId: string): Promise<void> {
  await db.transaction('rw', db.notebooks, db.pages, db.attachments, async () => {
    const pages = await db.pages.where('notebookId').equals(notebookId).toArray()
    const pageIds = pages.map((page) => page.id)

    for (const pageId of pageIds) {
      await db.attachments.where('pageId').equals(pageId).delete()
    }

    await db.pages.where('notebookId').equals(notebookId).delete()
    await db.notebooks.delete(notebookId)
  })
}

export async function exportBackupPayload(): Promise<BackupPayload> {
  const [users, notebooks, pages, attachments] = await Promise.all([
    db.users.toArray(),
    db.notebooks.toArray(),
    db.pages.toArray(),
    db.attachments.toArray(),
  ])

  const attachmentExports = await Promise.all(attachments.map((attachment) => attachmentToExport(attachment)))

  return {
    version: 1,
    exportedAt: Date.now(),
    users,
    notebooks,
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
  await db.transaction('rw', db.users, db.notebooks, db.pages, db.attachments, async () => {
    if (mode === 'replace') {
      await Promise.all([db.users.clear(), db.notebooks.clear(), db.pages.clear(), db.attachments.clear()])
    }

    if (payload.users.length > 0) {
      await db.users.bulkPut(payload.users)
    }
    if (payload.notebooks.length > 0) {
      await db.notebooks.bulkPut(payload.notebooks)
    }
    if (payload.pages.length > 0) {
      await db.pages.bulkPut(payload.pages)
    }
    if (payload.attachments.length > 0) {
      await db.attachments.bulkPut(payload.attachments.map((attachment) => attachmentFromExport(attachment)))
    }
  })
}
