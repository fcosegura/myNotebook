import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { v4 as uuidv4 } from 'uuid'
import './CanvasEditor.css'
import type { Attachment } from '../../storage/db'
import { addAttachment, deleteAttachment } from '../../storage/repository'
import { buildAttachmentName, downscaleImage } from '../images/downscale'
import { parseCanvasContent, stringifyCanvasContent } from './serialize'
import type { CanvasDocumentV1, CanvasElement, CanvasImageElement, CanvasTextElement } from './types'
import {
  CANVAS_BOARD_MIN_HEIGHT,
  DEFAULT_IMAGE_WIDTH_RATIO,
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_TEXT_WIDTH,
  MIN_IMAGE_SIZE,
  MIN_TEXT_HEIGHT,
  MIN_TEXT_WIDTH,
} from './types'

type CanvasEditorProps = {
  pageId: string
  content: string
  attachments: Attachment[]
  onContentChange: (content: string) => void
  onAttachmentsChange: () => void
  pastingImage: boolean
  onPastingChange: (value: boolean) => void
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

type Interaction =
  | {
      kind: 'drag'
      elementId: string
      startX: number
      startY: number
      originX: number
      originY: number
    }
  | {
      kind: 'resize'
      elementId: string
      handle: ResizeHandle
      startX: number
      startY: number
      originX: number
      originY: number
      originWidth: number
      originHeight: number
    }

const SAVE_DEBOUNCE_MS = 400

export function CanvasEditor({
  pageId,
  content,
  attachments,
  onContentChange,
  onAttachmentsChange,
  pastingImage,
  onPastingChange,
}: CanvasEditorProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef(content)
  const saveTimerRef = useRef<number | null>(null)
  const interactionRef = useRef<Interaction | null>(null)

  const [document, setDocument] = useState<CanvasDocumentV1>(() => parseCanvasContent(content))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)

  const attachmentMap = useMemo(
    () => new Map(attachments.map((attachment) => [attachment.id, attachment])),
    [attachments],
  )

  const attachmentUrls = useMemo(() => {
    const urls = new Map<string, string>()
    for (const attachment of attachments) {
      urls.set(attachment.id, URL.createObjectURL(attachment.blob))
    }
    return urls
  }, [attachments])

  useEffect(() => {
    return () => {
      for (const url of attachmentUrls.values()) {
        URL.revokeObjectURL(url)
      }
    }
  }, [attachmentUrls])

  useEffect(() => {
    contentRef.current = content
    setDocument(parseCanvasContent(content))
    setSelectedId(null)
    setEditingTextId(null)
  }, [pageId])

  const flushSave = useCallback(
    (nextDocument: CanvasDocumentV1) => {
      const serialized = stringifyCanvasContent(nextDocument)
      contentRef.current = serialized
      onContentChange(serialized)
    },
    [onContentChange],
  )

  const scheduleSave = useCallback(
    (nextDocument: CanvasDocumentV1) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = window.setTimeout(() => {
        flushSave(nextDocument)
        saveTimerRef.current = null
      }, SAVE_DEBOUNCE_MS)
    },
    [flushSave],
  )

  const updateDocument = useCallback(
    (updater: (current: CanvasDocumentV1) => CanvasDocumentV1, options?: { immediate?: boolean }) => {
      setDocument((current) => {
        const next = updater(current)
        if (options?.immediate) {
          flushSave(next)
        } else {
          scheduleSave(next)
        }
        return next
      })
    },
    [flushSave, scheduleSave],
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const getBoardSize = useCallback(() => {
    const rect = boardRef.current?.getBoundingClientRect()
    return {
      width: rect?.width ?? 800,
      height: rect?.height ?? CANVAS_BOARD_MIN_HEIGHT,
    }
  }, [])

  const getNextZIndex = useCallback((elements: CanvasElement[]) => {
    return elements.reduce((max, element) => Math.max(max, element.zIndex), 0) + 1
  }, [])

  const bringToFront = useCallback(
    (elementId: string) => {
      updateDocument((current) => {
        const nextZ = getNextZIndex(current.elements)
        return {
          ...current,
          elements: current.elements.map((element) =>
            element.id === elementId ? { ...element, zIndex: nextZ } : element,
          ),
        }
      })
    },
    [getNextZIndex, updateDocument],
  )

  const addTextElement = useCallback(() => {
    const { width: boardWidth, height: boardHeight } = getBoardSize()
    const element: CanvasTextElement = {
      id: uuidv4(),
      type: 'text',
      x: Math.max(16, (boardWidth - DEFAULT_TEXT_WIDTH) / 2),
      y: Math.max(16, (boardHeight - DEFAULT_TEXT_HEIGHT) / 2),
      width: DEFAULT_TEXT_WIDTH,
      height: DEFAULT_TEXT_HEIGHT,
      text: '',
      zIndex: 0,
    }

    updateDocument((current) => ({
      ...current,
      elements: [...current.elements, { ...element, zIndex: getNextZIndex(current.elements) }],
    }))

    setSelectedId(element.id)
    setEditingTextId(element.id)
  }, [getBoardSize, getNextZIndex, updateDocument])

  const addImageElement = useCallback(
    async (file: File | Blob) => {
      onPastingChange(true)
      try {
        const processed = await downscaleImage(file)
        const attachmentName = buildAttachmentName(attachments.length + 1)
        const attachment = await addAttachment(
          pageId,
          processed.blob,
          processed.width,
          processed.height,
          attachmentName,
        )

        const { width: boardWidth, height: boardHeight } = getBoardSize()
        const targetWidth = Math.min(
          boardWidth * DEFAULT_IMAGE_WIDTH_RATIO,
          processed.width,
          boardWidth - 32,
        )
        const targetHeight = Math.max(
          MIN_IMAGE_SIZE,
          Math.round((processed.height / processed.width) * targetWidth),
        )

        const element: CanvasImageElement = {
          id: uuidv4(),
          type: 'image',
          x: Math.max(16, (boardWidth - targetWidth) / 2),
          y: Math.max(16, (boardHeight - targetHeight) / 2),
          width: targetWidth,
          height: targetHeight,
          attachmentId: attachment.id,
          zIndex: 0,
        }

        updateDocument(
          (current) => ({
            ...current,
            elements: [...current.elements, { ...element, zIndex: getNextZIndex(current.elements) }],
          }),
          { immediate: true },
        )

        setSelectedId(element.id)
        onAttachmentsChange()
      } finally {
        onPastingChange(false)
      }
    },
    [attachments.length, getBoardSize, getNextZIndex, onAttachmentsChange, onPastingChange, pageId, updateDocument],
  )

  const deleteSelectedElement = useCallback(async () => {
    if (!selectedId) {
      return
    }

    const target = document.elements.find((element) => element.id === selectedId)
    if (!target) {
      return
    }

    if (target.type === 'image') {
      const stillReferenced = document.elements.some(
        (element) =>
          element.id !== target.id &&
          element.type === 'image' &&
          element.attachmentId === target.attachmentId,
      )
      if (!stillReferenced) {
        await deleteAttachment(target.attachmentId)
        onAttachmentsChange()
      }
    }

    updateDocument(
      (current) => ({
        ...current,
        elements: current.elements.filter((element) => element.id !== selectedId),
      }),
      { immediate: true },
    )

    setSelectedId(null)
    setEditingTextId(null)
  }, [document.elements, onAttachmentsChange, selectedId, updateDocument])

  const updateElement = useCallback(
    (elementId: string, patch: Partial<CanvasElement>) => {
      updateDocument((current) => ({
        ...current,
        elements: current.elements.map((element) =>
          element.id === elementId ? ({ ...element, ...patch } as CanvasElement) : element,
        ),
      }))
    },
    [updateDocument],
  )

  const clampPosition = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const { width: boardWidth, height: boardHeight } = getBoardSize()
      return {
        x: Math.max(0, Math.min(x, boardWidth - width)),
        y: Math.max(0, Math.min(y, boardHeight - height)),
      }
    },
    [getBoardSize],
  )

  const clampSize = useCallback((element: CanvasElement, width: number, height: number) => {
    if (element.type === 'text') {
      return {
        width: Math.max(MIN_TEXT_WIDTH, width),
        height: Math.max(MIN_TEXT_HEIGHT, height),
      }
    }
    return {
      width: Math.max(MIN_IMAGE_SIZE, width),
      height: Math.max(MIN_IMAGE_SIZE, height),
    }
  }, [])

  const endInteraction = useCallback(() => {
    if (!interactionRef.current) {
      return
    }
    interactionRef.current = null
    updateDocument((current) => current, { immediate: true })
  }, [updateDocument])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current
      if (!interaction) {
        return
      }

      const deltaX = event.clientX - interaction.startX
      const deltaY = event.clientY - interaction.startY

      if (interaction.kind === 'drag') {
        const target = document.elements.find((element) => element.id === interaction.elementId)
        if (!target) {
          return
        }
        const position = clampPosition(
          interaction.originX + deltaX,
          interaction.originY + deltaY,
          target.width,
          target.height,
        )
        updateElement(interaction.elementId, position)
        return
      }

      const target = document.elements.find((element) => element.id === interaction.elementId)
      if (!target) {
        return
      }

      let nextX = interaction.originX
      let nextY = interaction.originY
      let nextWidth = interaction.originWidth
      let nextHeight = interaction.originHeight

      if (interaction.handle.includes('e')) {
        nextWidth = interaction.originWidth + deltaX
      }
      if (interaction.handle.includes('w')) {
        nextWidth = interaction.originWidth - deltaX
        nextX = interaction.originX + deltaX
      }
      if (interaction.handle.includes('s')) {
        nextHeight = interaction.originHeight + deltaY
      }
      if (interaction.handle.includes('n')) {
        nextHeight = interaction.originHeight - deltaY
        nextY = interaction.originY + deltaY
      }

      const sized = clampSize(target, nextWidth, nextHeight)
      const position = clampPosition(nextX, nextY, sized.width, sized.height)
      updateElement(interaction.elementId, { ...position, ...sized })
    }

    function handlePointerUp() {
      endInteraction()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [clampPosition, clampSize, document.elements, endInteraction, updateElement])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (editingTextId) {
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }
      if (!selectedId) {
        return
      }
      event.preventDefault()
      void deleteSelectedElement()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelectedElement, editingTextId, selectedId])

  async function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith('image/'))
    if (!item) {
      return
    }

    event.preventDefault()
    const file = item.getAsFile()
    if (!file) {
      return
    }
    await addImageElement(file)
  }

  function startDrag(event: ReactPointerEvent, element: CanvasElement) {
    if (editingTextId === element.id) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(element.id)
    bringToFront(element.id)
    interactionRef.current = {
      kind: 'drag',
      elementId: element.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
    }
  }

  function startResize(event: ReactPointerEvent, element: CanvasElement, handle: ResizeHandle) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(element.id)
    bringToFront(element.id)
    interactionRef.current = {
      kind: 'resize',
      elementId: element.id,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
      originWidth: element.width,
      originHeight: element.height,
    }
  }

  const sortedElements = [...document.elements].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div className="canvas-editor">
      <div className="canvas-toolbar">
        <button type="button" onClick={addTextElement}>
          + Texto
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={pastingImage}>
          + Imagen
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => void deleteSelectedElement()}
          disabled={!selectedId}
        >
          Eliminar elemento
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              void addImageElement(file)
            }
          }}
        />
      </div>
      <div
        ref={boardRef}
        className="canvas-board"
        tabIndex={0}
        onPaste={(event) => void handlePaste(event)}
        onPointerDown={() => {
          setSelectedId(null)
          setEditingTextId(null)
        }}
      >
        {sortedElements.map((element) => {
          const selected = selectedId === element.id
          if (element.type === 'text') {
            return (
              <div
                key={element.id}
                className={`canvas-element canvas-element-text${selected ? ' selected' : ''}`}
                style={{
                  left: element.x,
                  top: element.y,
                  width: element.width,
                  height: element.height,
                  zIndex: element.zIndex,
                }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  setSelectedId(element.id)
                  bringToFront(element.id)
                }}
              >
                <div
                  className="canvas-element-body"
                  onPointerDown={(event) => startDrag(event, element)}
                  style={{ width: '100%', height: '100%' }}
                >
                  <textarea
                    value={element.text}
                    placeholder="Escribe aqui..."
                    onFocus={() => {
                      setEditingTextId(element.id)
                      setSelectedId(element.id)
                    }}
                    onBlur={() => setEditingTextId(null)}
                    onChange={(event) => updateElement(element.id, { text: event.target.value })}
                    onPointerDown={(event) => event.stopPropagation()}
                  />
                </div>
                {selected
                  ? (['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map((handle) => (
                      <span
                        key={handle}
                        className={`canvas-resize-handle ${handle}`}
                        onPointerDown={(event) => startResize(event, element, handle)}
                      />
                    ))
                  : null}
              </div>
            )
          }

          const attachment = attachmentMap.get(element.attachmentId)
          return (
            <div
              key={element.id}
              className={`canvas-element canvas-element-image${selected ? ' selected' : ''}`}
              style={{
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                zIndex: element.zIndex,
              }}
              onPointerDown={(event) => {
                event.stopPropagation()
                setSelectedId(element.id)
                bringToFront(element.id)
              }}
            >
              <div
                className="canvas-element-body"
                onPointerDown={(event) => startDrag(event, element)}
                style={{ width: '100%', height: '100%' }}
              >
                {attachment ? (
                  <img
                    src={attachmentUrls.get(attachment.id) ?? ''}
                    alt={attachment.name ?? 'Imagen canvas'}
                  />
                ) : (
                  <div className="canvas-image-missing">Imagen no disponible</div>
                )}
              </div>
              {selected
                ? (['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map((handle) => (
                    <span
                      key={handle}
                      className={`canvas-resize-handle ${handle}`}
                      onPointerDown={(event) => startResize(event, element, handle)}
                    />
                  ))
                : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
