// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  commentContainingRange,
  createCommentWidget,
  getCommentBodyText,
  insertCommentAtRange,
  toggleCommentCollapsed,
  unwrapCommentElement,
  updateCommentBody,
} from './editorRichText'

describe('editorRichText comments', () => {
  it('creates a collapsible comment widget with highlighted text', () => {
    const comment = createCommentWidget('texto importante', 'Mi nota', true)

    expect(comment.className).toBe('editor-comment')
    expect(comment.dataset.collapsed).toBe('true')
    expect(comment.querySelector('.editor-comment-highlight')?.textContent).toBe('texto importante')
    expect(getCommentBodyText(comment)).toBe('Mi nota')
    expect(comment.querySelector('.editor-comment-body')?.hasAttribute('hidden')).toBe(true)
  })

  it('inserts a comment around the current selection', () => {
    const editor = document.createElement('div')
    editor.innerHTML = 'Hola mundo'
    document.body.appendChild(editor)

    const textNode = editor.firstChild as Text
    const range = document.createRange()
    range.setStart(textNode, 5)
    range.setEnd(textNode, 10)

    const comment = insertCommentAtRange(range, 'Comentario de prueba')
    expect(comment).not.toBeNull()
    expect(editor.textContent).toContain('mundo')
    expect(getCommentBodyText(comment!)).toBe('Comentario de prueba')
    expect(editor.querySelector('.editor-comment-highlight')?.textContent).toBe('mundo')

    editor.remove()
  })

  it('toggles collapsed state and aria attributes', () => {
    const comment = createCommentWidget('resaltado', 'detalle', true)
    const toggle = comment.querySelector('.editor-comment-toggle') as HTMLButtonElement

    toggleCommentCollapsed(comment)

    expect(comment.dataset.collapsed).toBe('false')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(comment.querySelector('.editor-comment-body')?.hasAttribute('hidden')).toBe(false)

    toggleCommentCollapsed(comment)

    expect(comment.dataset.collapsed).toBe('true')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(comment.querySelector('.editor-comment-body')?.hasAttribute('hidden')).toBe(true)
  })

  it('updates and removes comment content', () => {
    const editor = document.createElement('div')
    const comment = createCommentWidget('clave', 'viejo', false)
    editor.appendChild(comment)

    updateCommentBody(comment, 'nuevo')
    expect(getCommentBodyText(comment)).toBe('nuevo')

    unwrapCommentElement(comment)
    expect(editor.textContent).toBe('clave')
    expect(editor.querySelector('.editor-comment')).toBeNull()
  })

  it('detects when the selection is inside a comment', () => {
    const editor = document.createElement('div')
    const comment = createCommentWidget('seleccion', 'nota', false)
    editor.appendChild(comment)

    const highlight = comment.querySelector('.editor-comment-highlight')?.firstChild as Text
    const range = document.createRange()
    range.setStart(highlight, 0)
    range.setEnd(highlight, 3)

    expect(commentContainingRange(editor, range)).toBe(comment)
  })
})
