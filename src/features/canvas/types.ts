export const CANVAS_DOCUMENT_VERSION = 1
export const CANVAS_BOARD_MIN_HEIGHT = 420
export const MIN_TEXT_WIDTH = 80
export const MIN_TEXT_HEIGHT = 40
export const MIN_IMAGE_SIZE = 60
export const DEFAULT_TEXT_WIDTH = 220
export const DEFAULT_TEXT_HEIGHT = 100
export const DEFAULT_IMAGE_WIDTH_RATIO = 0.6

export type CanvasTextElement = {
  id: string
  type: 'text'
  x: number
  y: number
  width: number
  height: number
  text: string
  zIndex: number
}

export type CanvasImageElement = {
  id: string
  type: 'image'
  x: number
  y: number
  width: number
  height: number
  attachmentId: string
  zIndex: number
}

export type CanvasElement = CanvasTextElement | CanvasImageElement

export type CanvasDocumentV1 = {
  version: typeof CANVAS_DOCUMENT_VERSION
  elements: CanvasElement[]
}
