const IMG_REF_IN_TEXT_PATTERN = /\[img:([^\]]+)\]/g
const EDITOR_AUTO_LINK_CLASS = 'editor-auto-link'
/** http(s) and www. URLs in plain text (not inside existing anchors). */
const AUTO_LINK_URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi

export function blockquoteContainingRange(root: HTMLElement, range: Range): HTMLElement | null {
  let n: Node | null = range.commonAncestorContainer
  if (n.nodeType === Node.TEXT_NODE) {
    n = n.parentNode
  }
  while (n && n !== root) {
    if (n.nodeName === 'BLOCKQUOTE') {
      return n as HTMLElement
    }
    n = n.parentNode
  }
  return null
}

export function unwrapBlockquoteElement(bq: HTMLElement) {
  const parent = bq.parentNode
  if (!parent) {
    return
  }
  const fragment = document.createDocumentFragment()
  while (bq.firstChild) {
    fragment.appendChild(bq.firstChild)
  }
  parent.insertBefore(fragment, bq)
  parent.removeChild(bq)
}

/** Marca el inicio del rango (colapsado) para restaurar el cursor tras cambios DOM. */
export function insertCaretMarkerBeforeCollapsed(range: Range): HTMLElement | null {
  try {
    const boundary = range.cloneRange()
    boundary.collapse(true)
    const marker = document.createElement('span')
    marker.setAttribute('data-editor-caret-restore', '')
    boundary.insertNode(marker)
    return marker
  } catch {
    return null
  }
}

export function restoreCaretAtMarker(marker: HTMLElement, selection: Selection) {
  const parent = marker.parentNode
  if (!parent) {
    marker.remove()
    return
  }
  const idx = Array.prototype.indexOf.call(parent.childNodes, marker)
  marker.remove()
  const nextRange = document.createRange()
  const safeIdx = Math.min(Math.max(0, idx), parent.childNodes.length)
  nextRange.setStart(parent, safeIdx)
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)
}

function linkifyEditorAutoLinks(root: HTMLElement) {
  linkifyImgRefsInEditor(root)
  linkifyUrlsInEditor(root)
}

/**
 * Auto-enlaces reemplazan nodos de texto; sin esto el navegador suele colapsar la seleccion al inicio del editor.
 */
export function linkifyEditorAutoLinksPreservingCaret(root: HTMLElement) {
  const sel = window.getSelection()
  let marker: HTMLElement | null = null
  if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
    const range = sel.getRangeAt(0)
    if (root.contains(range.commonAncestorContainer)) {
      marker = insertCaretMarkerBeforeCollapsed(range)
    }
  }
  try {
    linkifyEditorAutoLinks(root)
  } finally {
    if (marker) {
      if (sel && marker.isConnected) {
        restoreCaretAtMarker(marker, sel)
      } else if (marker.isConnected) {
        marker.remove()
      }
    }
  }
}

function normalizeAutoLinkUrl(raw: string): { display: string; href: string; tail: string } {
  const tailMatch = raw.match(/([.,;:!?)'»\]]+)$/u)
  const tail = tailMatch?.[1] ?? ''
  const display = tail ? raw.slice(0, -tail.length) : raw
  let href = display
  if (!/^https?:\/\//i.test(href)) {
    href = `https://${href}`
  }
  return { display, href, tail }
}

/** Wrap plain URLs in non-editable anchors (opens in new tab). Skips text inside any `<a>`. */
function linkifyUrlsInEditor(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!(node instanceof Text)) {
      continue
    }
    const text = node.textContent ?? ''
    if (!/\bhttps?:\/\/|\bwww\./i.test(text)) {
      continue
    }
    let el: HTMLElement | null = node.parentElement
    let insideAnchor = false
    while (el && el !== root) {
      if (el.tagName === 'A') {
        insideAnchor = true
        break
      }
      el = el.parentElement
    }
    if (!insideAnchor) {
      textNodes.push(node)
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? ''
    AUTO_LINK_URL_PATTERN.lastIndex = 0
    if (!AUTO_LINK_URL_PATTERN.test(text)) {
      continue
    }
    AUTO_LINK_URL_PATTERN.lastIndex = 0
    const frag = document.createDocumentFragment()
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = AUTO_LINK_URL_PATTERN.exec(text)) !== null) {
      const raw = match[0]
      const { display, href, tail } = normalizeAutoLinkUrl(raw)
      if (!display) {
        lastIndex = match.index + raw.length
        continue
      }
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
      }
      const anchor = document.createElement('a')
      anchor.className = EDITOR_AUTO_LINK_CLASS
      anchor.href = href
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.setAttribute('contenteditable', 'false')
      anchor.textContent = display
      frag.appendChild(anchor)
      if (tail) {
        frag.appendChild(document.createTextNode(tail))
      }
      lastIndex = match.index + raw.length
    }
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)))
    }
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}

/** Wrap plain `[img:token]` text in non-editable links for preview + click to open modal. */
function linkifyImgRefsInEditor(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node instanceof Text && node.textContent?.includes('[img:')) {
      let el: HTMLElement | null = node.parentElement
      let insideLink = false
      while (el && el !== root) {
        if (el.classList.contains('editor-img-ref')) {
          insideLink = true
          break
        }
        el = el.parentElement
      }
      if (!insideLink) {
        textNodes.push(node)
      }
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? ''
    IMG_REF_IN_TEXT_PATTERN.lastIndex = 0
    if (!IMG_REF_IN_TEXT_PATTERN.test(text)) {
      continue
    }
    IMG_REF_IN_TEXT_PATTERN.lastIndex = 0
    const frag = document.createDocumentFragment()
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = IMG_REF_IN_TEXT_PATTERN.exec(text)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
      }
      const token = match[1]
      const anchor = document.createElement('a')
      anchor.className = 'editor-img-ref'
      anchor.href = '#'
      anchor.dataset.imgRef = token
      anchor.setAttribute('contenteditable', 'false')
      anchor.textContent = `[img:${token}]`
      frag.appendChild(anchor)
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)))
    }
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}

export function insertImagePasteMarker(editor: HTMLDivElement): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return null
  }
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) {
    return null
  }

  const marker = document.createElement('span')
  marker.dataset.imagePasteMarker = crypto.randomUUID()
  marker.setAttribute('contenteditable', 'false')
  marker.style.display = 'inline-block'
  marker.style.width = '0'
  marker.style.overflow = 'hidden'
  marker.textContent = '\u200b'

  range.deleteContents()
  range.insertNode(marker)
  const nextRange = document.createRange()
  nextRange.setStartAfter(marker)
  nextRange.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(nextRange)

  return marker
}

export function insertImageReferenceAtPasteMarker(
  editor: HTMLDivElement,
  marker: HTMLElement | null,
  token: string,
): string {
  const anchor = createImageReferenceAnchor(token)
  const insertAfter = marker?.isConnected ? marker : null

  if (insertAfter) {
    insertAfter.replaceWith(anchor)
  } else {
    insertImageReferenceAtCurrentSelection(editor, anchor)
  }

  placeCaretAfterNode(anchor)
  editor.focus()

  return editor.innerHTML
}

function insertImageReferenceAtCurrentSelection(editor: HTMLDivElement, anchor: HTMLAnchorElement) {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    if (editor.contains(range.commonAncestorContainer)) {
      range.deleteContents()
      range.insertNode(anchor)
      return
    }
  }
  editor.appendChild(anchor)
}

function createImageReferenceAnchor(token: string): HTMLAnchorElement {
  const anchor = document.createElement('a')
  anchor.className = 'editor-img-ref'
  anchor.href = '#'
  anchor.dataset.imgRef = token
  anchor.setAttribute('contenteditable', 'false')
  anchor.textContent = `[img:${token}]`
  return anchor
}

function placeCaretAfterNode(node: Node) {
  const selection = window.getSelection()
  if (!selection) {
    return
  }
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function appendImageReferenceToContent(content: string, token: string): string {
  const reference = `[img:${escapeHtml(token)}]`
  return `${content}${reference}`
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
