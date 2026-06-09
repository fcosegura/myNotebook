const encoder = new TextEncoder()
const decoder = new TextDecoder()
const ENCRYPTED_PREFIX = 'enc:v1:'
const ENCRYPTED_BLOB_PREFIX = 'encb:v1:'

let activeContentKey: CryptoKey | null = null

export async function unlockVaultWithPin(pin: string, salt: string, iterations = 100_000): Promise<void> {
  activeContentKey = await deriveContentKey(pin, salt, iterations)
}

export async function unlockVaultWithDirectKey(rawKeyBase64: string): Promise<void> {
  const binary = atob(rawKeyBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  activeContentKey = await crypto.subtle.importKey(
    'raw',
    bytes.buffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function lockVault(): void {
  activeContentKey = null
}

export function isVaultUnlocked(): boolean {
  return activeContentKey !== null
}
export async function encryptField(plainText: string): Promise<string> {
  if (!activeContentKey) {
    throw new Error('Vault bloqueado. Desbloquea la sesion para cifrar datos.')
  }
  if (plainText.startsWith(ENCRYPTED_PREFIX)) {
    return plainText
  }

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    activeContentKey,
    encoder.encode(plainText),
  )

  return `${ENCRYPTED_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
}

export async function decryptField(value: string): Promise<string> {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }
  if (!activeContentKey) {
    throw new Error('Vault bloqueado. No se pueden leer datos cifrados.')
  }

  const [, encoded] = value.split(ENCRYPTED_PREFIX)
  const [ivBase64, ciphertextBase64] = encoded.split(':')
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Formato de campo cifrado invalido.')
  }

  const iv = fromBase64(ivBase64)
  const ciphertext = fromBase64(ciphertextBase64)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    activeContentKey,
    ciphertext,
  )
  return decoder.decode(plain)
}

export function isEncryptedField(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX)
}

export async function encryptBlob(blob: Blob): Promise<Blob> {
  if (!activeContentKey) {
    throw new Error('Vault bloqueado. Desbloquea la sesion para cifrar datos.')
  }
  if (await isEncryptedBlob(blob)) {
    return blob
  }

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = await blob.arrayBuffer()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    activeContentKey,
    plaintext,
  )

  const payload = `${ENCRYPTED_BLOB_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
  return new Blob([payload], { type: 'application/octet-stream' })
}

export async function decryptBlob(blob: Blob): Promise<Blob> {
  const payload = await blob.text()
  if (!payload.startsWith(ENCRYPTED_BLOB_PREFIX)) {
    return blob
  }
  if (!activeContentKey) {
    throw new Error('Vault bloqueado. No se pueden leer datos cifrados.')
  }

  const encoded = payload.slice(ENCRYPTED_BLOB_PREFIX.length)
  const [ivBase64, ciphertextBase64] = encoded.split(':')
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Formato de adjunto cifrado invalido.')
  }

  const iv = fromBase64(ivBase64)
  const ciphertext = fromBase64(ciphertextBase64)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    activeContentKey,
    ciphertext,
  )
  return new Blob([plain], { type: blob.type || 'application/octet-stream' })
}

export async function isEncryptedBlob(blob: Blob): Promise<boolean> {
  if (blob.size === 0) {
    return false
  }
  const prefixSample = await blob.slice(0, ENCRYPTED_BLOB_PREFIX.length).text()
  return prefixSample === ENCRYPTED_BLOB_PREFIX
}

export async function deriveContentKey(pin: string, salt: string, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode(`${salt}:content`),
      iterations,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function importDirectKey(rawKeyBase64: string): Promise<CryptoKey> {
  const binary = atob(rawKeyBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return crypto.subtle.importKey(
    'raw',
    bytes.buffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptFieldWithKey(plainText: string, key: CryptoKey): Promise<string> {
  if (plainText.startsWith(ENCRYPTED_PREFIX)) {
    return plainText
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText),
  )
  return `${ENCRYPTED_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
}

export async function decryptFieldWithKey(value: string, key: CryptoKey): Promise<string> {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }
  const [, encoded] = value.split(ENCRYPTED_PREFIX)
  const [ivBase64, ciphertextBase64] = encoded.split(':')
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Formato de campo cifrado invalido.')
  }
  const iv = fromBase64(ivBase64)
  const ciphertext = fromBase64(ciphertextBase64)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  return decoder.decode(plain)
}

export async function encryptBlobWithKey(blob: Blob, key: CryptoKey): Promise<Blob> {
  if (await isEncryptedBlob(blob)) {
    return blob
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = await blob.arrayBuffer()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  )
  const payload = `${ENCRYPTED_BLOB_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
  return new Blob([payload], { type: 'application/octet-stream' })
}

export async function decryptBlobWithKey(blob: Blob, key: CryptoKey): Promise<Blob> {
  const payload = await blob.text()
  if (!payload.startsWith(ENCRYPTED_BLOB_PREFIX)) {
    return blob
  }
  const encoded = payload.slice(ENCRYPTED_BLOB_PREFIX.length)
  const [ivBase64, ciphertextBase64] = encoded.split(':')
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Formato de adjunto cifrado invalido.')
  }
  const iv = fromBase64(ivBase64)
  const ciphertext = fromBase64(ciphertextBase64)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  return new Blob([plain], { type: blob.type || 'application/octet-stream' })
}

export function getActiveContentKey(): CryptoKey | null {
  return activeContentKey
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}
