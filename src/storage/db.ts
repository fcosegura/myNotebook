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
  pwaTaskId?: string
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

function createDbInstance(name: string) {
  const newDb = new Dexie(name) as Dexie & {
    users: EntityTable<UserLocal, 'id'>
    notebooks: EntityTable<Notebook, 'id'>
    pages: EntityTable<Page, 'id'>
    attachments: EntityTable<Attachment, 'id'>
  }

  newDb.version(1).stores({
    users: 'id, createdAt',
    notebooks: 'id, updatedAt, title, pinned',
    pages: 'id, notebookId, updatedAt, title, *tags',
    attachments: 'id, pageId, createdAt',
  })

  newDb.version(2)
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

  return newDb
}

let activeDb = createDbInstance('local-notebook-db')

export async function switchDatabase(userIdHash: string): Promise<void> {
  const targetName = `local-notebook-db-${userIdHash}`
  if (activeDb.name === targetName) {
    return
  }
  await activeDb.close()
  activeDb = createDbInstance(targetName)
  await activeDb.open()
}

export const db = new Proxy({}, {
  get(_target, prop) {
    const value = Reflect.get(activeDb, prop)
    if (typeof value === 'function') {
      return value.bind(activeDb)
    }
    return value
  }
}) as Dexie & {
  users: EntityTable<UserLocal, 'id'>
  notebooks: EntityTable<Notebook, 'id'>
  pages: EntityTable<Page, 'id'>
  attachments: EntityTable<Attachment, 'id'>
}
