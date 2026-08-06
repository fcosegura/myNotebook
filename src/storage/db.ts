import Dexie, { type EntityTable } from 'dexie'

export type SessionConfig = {
  pinHash: string
  salt: string
  iterations: number
}

export type UserLocal = {
  id: string
  displayName: string
  sessionConfig: SessionConfig | null
  createdAt: number
}

export type Space = {
  id: string
  title: string
  color: string
  pinned: boolean
  archived: boolean
  bookmarkPageId: string | null
  createdAt: number
  updatedAt: number
}

/** @deprecated Use Space. Kept for backup/legacy typing. */
export type Notebook = Space

export type Page = {
  id: string
  spaceId: string
  title: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type Attachment = {
  id: string
  pageId: string
  name?: string
  mimeType: string
  sizeBytes: number
  width: number
  height: number
  blob: Blob
  createdAt: number
}

const DATABASE_NAME = 'local-notebook-db'

export const db = new Dexie(DATABASE_NAME) as Dexie & {
  users: EntityTable<UserLocal, 'id'>
  spaces: EntityTable<Space, 'id'>
  pages: EntityTable<Page, 'id'>
  attachments: EntityTable<Attachment, 'id'>
}

db.version(1).stores({
  users: 'id, createdAt',
  notebooks: 'id, updatedAt, title, pinned',
  pages: 'id, notebookId, updatedAt, title, *tags',
  attachments: 'id, pageId, createdAt',
})

db.version(2)
  .stores({
    users: 'id, createdAt',
    notebooks: 'id, updatedAt, title, pinned, archived',
    pages: 'id, notebookId, updatedAt, title, *tags',
    attachments: 'id, pageId, createdAt',
  })
  .upgrade(async (tx) => {
    await tx
      .table('notebooks')
      .toCollection()
      .modify((row: Space & { archived?: boolean }) => {
        if (row.archived === undefined) {
          row.archived = false
        }
      })
  })

db.version(3)
  .stores({
    users: 'id, createdAt',
    spaces: 'id, updatedAt, title, pinned, archived',
    notebooks: null,
    pages: 'id, spaceId, updatedAt, title, *tags',
    attachments: 'id, pageId, createdAt',
  })
  .upgrade(async (tx) => {
    const notebooksTable = tx.table('notebooks')
    const spacesTable = tx.table('spaces')
    const notebooks = await notebooksTable.toArray()
    if (notebooks.length > 0) {
      await spacesTable.bulkPut(
        notebooks.map((row) => ({
          ...row,
          archived: row.archived === true,
        })),
      )
    }

    await tx
      .table('pages')
      .toCollection()
      .modify((row: Page & { notebookId?: string }) => {
        if (!row.spaceId && row.notebookId) {
          row.spaceId = row.notebookId
        }
        delete row.notebookId
      })
  })
