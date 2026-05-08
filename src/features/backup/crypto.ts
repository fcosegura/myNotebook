import type { Attachment, Notebook, Page, UserLocal } from '../../storage/db'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const MAGIC = 'LNBK'
const VERSION = 1
const PBKDF2_ITERATIONS = 300_000
const SALT_LENGTH = 16
const IV_LENGTH = 12

type AttachmentExport = Omit<Attachment, 'blob'> & {
  blobBase64: string
}

export type BackupPayload = {
  version: number
  exportedAt: number
  users: UserLocal[]
  notebooks: Notebook[]
  pages: Page[]
  attachments: AttachmentExport[]
}

export type EncryptedBackup = {
  version: number
  iterations: number
  salt: string
  iv: string
  data: string
}

export async function serializeEncryptedBackup(
  payload: BackupPayload,
  passphrase: string,
): Promise<string> {
  if (!passphrase.trim()) {
    throw new Error('La clave de exportacion no puede estar vacia.')
  }

  const plain = encoder.encode(JSON.stringify(payload))
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const normalizedSalt = toArrayBufferView(salt)
  const normalizedIv = toArrayBufferView(iv)
  const key = await deriveKey(passphrase, normalizedSalt, PBKDF2_ITERATIONS)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: normalizedIv }, key, plain)

  const body: EncryptedBackup = {
    version: VERSION,
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(normalizedSalt),
    iv: bytesToBase64(normalizedIv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  }

  return JSON.stringify({
    magic: MAGIC,
    ...body,
  })
}

export async function parseEncryptedBackup(
  raw: string,
  passphrase: string,
): Promise<BackupPayload> {
  if (!passphrase.trim()) {
    throw new Error('La clave de importacion no puede estar vacia.')
  }

  const parsed = JSON.parse(raw) as { magic?: string } & Partial<EncryptedBackup>
  if (parsed.magic !== MAGIC) {
    throw new Error('Formato de backup invalido.')
  }
  if (parsed.version !== VERSION) {
    throw new Error('Version de backup no compatible.')
  }
  if (!parsed.salt || !parsed.iv || !parsed.data || !parsed.iterations) {
    throw new Error('Backup incompleto o corrupto.')
  }

  const salt = toArrayBufferView(base64ToBytes(parsed.salt))
  const iv = toArrayBufferView(base64ToBytes(parsed.iv))
  const data = toArrayBufferView(base64ToBytes(parsed.data))
  const key = await deriveKey(passphrase, salt, parsed.iterations)

  let decrypted: ArrayBuffer
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  } catch {
    throw new Error('No se pudo descifrar el backup. Revisa la clave.')
  }

  const payload = JSON.parse(decoder.decode(decrypted)) as BackupPayload
  validatePayload(payload)
  return payload
}

export async function attachmentToExport(attachment: Attachment): Promise<AttachmentExport> {
  return {
    id: attachment.id,
    pageId: attachment.pageId,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    width: attachment.width,
    height: attachment.height,
    createdAt: attachment.createdAt,
    blobBase64: await blobToBase64(attachment.blob),
  }
}

export function attachmentFromExport(attachment: AttachmentExport): Attachment {
  return {
    id: attachment.id,
    pageId: attachment.pageId,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    width: attachment.width,
    height: attachment.height,
    createdAt: attachment.createdAt,
    blob: base64ToBlob(attachment.blobBase64, attachment.mimeType),
  }
}

function validatePayload(payload: BackupPayload): void {
  if (
    payload.version !== VERSION ||
    !Array.isArray(payload.users) ||
    !Array.isArray(payload.notebooks) ||
    !Array.isArray(payload.pages) ||
    !Array.isArray(payload.attachments)
  ) {
    throw new Error('Contenido del backup invalido.')
  }
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  return bytesToBase64(new Uint8Array(buffer))
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = toArrayBufferView(base64ToBytes(base64))
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes)
}
