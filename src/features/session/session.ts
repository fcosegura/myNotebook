const encoder = new TextEncoder()

export type SessionState = {
  configured: boolean
  unlocked: boolean
}

export async function hashPin(pin: string, salt: string, iterations = 100_000): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode(salt),
      iterations,
    },
    keyMaterial,
    256,
  )

  return bufferToHex(bits)
}

export function createSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return bufferToHex(bytes.buffer)
}

function bufferToHex(input: ArrayBuffer): string {
  return Array.from(new Uint8Array(input))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
