import {
  CANVAS_DOCUMENT_VERSION,
  type CanvasDocumentV1,
  type CanvasElement,
  type CanvasImageElement,
  type CanvasTextElement,
} from './types'

export function emptyCanvasDocument(): CanvasDocumentV1 {
  return {
    version: CANVAS_DOCUMENT_VERSION,
    elements: [],
  }
}

export function parseCanvasContent(raw: string): CanvasDocumentV1 {
  if (!raw.trim()) {
    return emptyCanvasDocument()
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isCanvasDocument(parsed)) {
      return emptyCanvasDocument()
    }
    return parsed
  } catch {
    return emptyCanvasDocument()
  }
}

export function stringifyCanvasContent(document: CanvasDocumentV1): string {
  return JSON.stringify(document)
}

export function extractCanvasSearchText(raw: string): string {
  const document = parseCanvasContent(raw)
  return document.elements
    .filter((element): element is CanvasTextElement => element.type === 'text')
    .map((element) => element.text.trim())
    .filter(Boolean)
    .join('\n')
}

function isCanvasDocument(value: unknown): value is CanvasDocumentV1 {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<CanvasDocumentV1>
  if (candidate.version !== CANVAS_DOCUMENT_VERSION || !Array.isArray(candidate.elements)) {
    return false
  }

  return candidate.elements.every(isCanvasElement)
}

function isCanvasElement(value: unknown): value is CanvasElement {
  if (!value || typeof value !== 'object') {
    return false
  }

  const element = value as Partial<CanvasElement>
  if (
    typeof element.id !== 'string' ||
    typeof element.x !== 'number' ||
    typeof element.y !== 'number' ||
    typeof element.width !== 'number' ||
    typeof element.height !== 'number' ||
    typeof element.zIndex !== 'number'
  ) {
    return false
  }

  if (element.type === 'text') {
    return typeof (element as Partial<CanvasTextElement>).text === 'string'
  }

  if (element.type === 'image') {
    return typeof (element as Partial<CanvasImageElement>).attachmentId === 'string'
  }

  return false
}
