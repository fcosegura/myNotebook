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

export type Notebook = {
  id: string
  title: string
  color: string
  pinned: boolean
  archived: boolean
  bookmarkPageId: string | null
  createdAt: number
  updatedAt: number
}

export type Page = {
  id: string
  notebookId: string
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
  notebooks: EntityTable<Notebook, 'id'>
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
      .modify((row: Notebook & { archived?: boolean }) => {
        if (row.archived === undefined) {
          row.archived = false
        }
      })
  })
