import { describe, expect, it } from 'vitest'
import { buildSearchIndex, htmlToSearchText, querySearch } from './search'
import type { Notebook, Page } from '../../storage/db'

describe('search', () => {
  it('converts editor HTML into readable plain text', () => {
    expect(
      htmlToSearchText('<b>Esta es una prueba</b><div><b><br></b></div><span style="font-size: 1.05rem;">estamos probando</span>'),
    ).toBe('Esta es una prueba estamos probando')
  })

  it('returns snippets without visible HTML tags', () => {
    const notebooks: Notebook[] = [
      {
        id: 'notebook-1',
        title: 'Mi libreta',
        color: '#ffffff',
        pinned: false,
        archived: false,
        bookmarkPageId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]
    const pages: Page[] = [
      {
        id: 'page-1',
        notebookId: 'notebook-1',
        title: 'test',
        content: '<b>Esta es una prueba</b><div><b><br></b></div><span style="font-size: 1.05rem;">estamos probando</span>',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]

    const [result] = querySearch(buildSearchIndex(notebooks, pages), 'prueba')

    expect(result.snippet).toBe('Esta es una prueba estamos probando')
  })
})
