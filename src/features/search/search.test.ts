import { describe, expect, it, beforeEach } from 'vitest'
import {
  buildSearchIndex,
  clearSearchIndexCache,
  getParsedDateFilterLabel,
  htmlToSearchText,
  parseSearchQuery,
  querySearch,
} from './search'
import type { Page, Space } from '../../storage/db'

const FIXED_NOW = new Date(2026, 7, 6, 15, 30, 0) // Thu Aug 6 2026 local

function makeSpace(partial: Partial<Space> & Pick<Space, 'id' | 'title'>): Space {
  return {
    color: '#ffffff',
    pinned: false,
    archived: false,
    bookmarkPageId: null,
    createdAt: FIXED_NOW.getTime(),
    updatedAt: FIXED_NOW.getTime(),
    ...partial,
  }
}

function makePage(partial: Partial<Page> & Pick<Page, 'id' | 'spaceId' | 'title' | 'content'>): Page {
  return {
    tags: [],
    createdAt: FIXED_NOW.getTime(),
    updatedAt: FIXED_NOW.getTime(),
    ...partial,
  }
}

describe('search', () => {
  beforeEach(() => {
    clearSearchIndexCache()
  })

  it('converts editor HTML into readable plain text', () => {
    expect(
      htmlToSearchText('<b>Esta es una prueba</b><div><b><br></b></div><span style="font-size: 1.05rem;">estamos probando</span>'),
    ).toBe('Esta es una prueba estamos probando')
  })

  it('returns snippets without visible HTML tags', () => {
    const spaces: Space[] = [makeSpace({ id: 'space-1', title: 'Mi espacio' })]
    const pages: Page[] = [
      makePage({
        id: 'page-1',
        spaceId: 'space-1',
        title: 'test',
        content: '<b>Esta es una prueba</b><div><b><br></b></div><span style="font-size: 1.05rem;">estamos probando</span>',
      }),
    ]

    const [result] = querySearch(buildSearchIndex(spaces, pages), 'prueba', FIXED_NOW)

    expect(result.snippet).toBe('Esta es una prueba estamos probando')
    expect(result.spaceTitle).toBe('Mi espacio')
  })

  it('parseSearchQuery extracts relative Spanish dates and stopwords', () => {
    const parsed = parseSearchQuery('qué planeé ayer', FIXED_NOW)
    expect(parsed.dateRange?.label).toBe('Ayer')
    expect(parsed.lexicalQuery).toBe('planeé')
    expect(getParsedDateFilterLabel('hoy', FIXED_NOW)).toBe('Hoy')
    expect(getParsedDateFilterLabel('esta semana', FIXED_NOW)).toBe('Esta semana')
    expect(getParsedDateFilterLabel('la semana pasada', FIXED_NOW)).toBe('La semana pasada')
    expect(getParsedDateFilterLabel('este mes', FIXED_NOW)).toBe('Este mes')
  })

  it('filters by ayer after lexical scoring', () => {
    const yesterday = new Date(2026, 7, 5, 10, 0, 0).getTime()
    const today = FIXED_NOW.getTime()
    const spaces = [makeSpace({ id: 'space-1', title: 'Trabajo' })]
    const pages = [
      makePage({
        id: 'page-yesterday',
        spaceId: 'space-1',
        title: 'Plan',
        content: '<p>qué planeé para el sprint</p>',
        updatedAt: yesterday,
        createdAt: yesterday,
      }),
      makePage({
        id: 'page-today',
        spaceId: 'space-1',
        title: 'Plan hoy',
        content: '<p>qué planeé ahora</p>',
        updatedAt: today,
        createdAt: today,
      }),
    ]

    const results = querySearch(buildSearchIndex(spaces, pages), 'qué planeé ayer', FIXED_NOW)
    expect(results.map((item) => item.pageId)).toEqual(['page-yesterday'])
  })

  it('date-only query returns pages touched in that range', () => {
    const yesterday = new Date(2026, 7, 5, 18, 0, 0).getTime()
    const spaces = [makeSpace({ id: 'space-1', title: 'Personal' })]
    const pages = [
      makePage({
        id: 'touched-yesterday',
        spaceId: 'space-1',
        title: 'Diario',
        content: '<p>sin palabras clave</p>',
        updatedAt: yesterday,
      }),
      makePage({
        id: 'untouched',
        spaceId: 'space-1',
        title: 'Viejo',
        content: '<p>otro</p>',
        updatedAt: new Date(2026, 6, 1).getTime(),
      }),
    ]

    const results = querySearch(buildSearchIndex(spaces, pages), 'ayer', FIXED_NOW)
    expect(results.map((item) => item.pageId)).toEqual(['touched-yesterday'])
  })

  it('reuses cached MiniSearch index when data is unchanged', () => {
    const spaces = [makeSpace({ id: 'space-1', title: 'Cache' })]
    const pages = [makePage({ id: 'page-1', spaceId: 'space-1', title: 'Nota', content: '<p>hola</p>' })]

    const first = buildSearchIndex(spaces, pages)
    const second = buildSearchIndex(spaces, pages)
    expect(second).toBe(first)

    const changedPages = [
      makePage({
        id: 'page-1',
        spaceId: 'space-1',
        title: 'Nota',
        content: '<p>hola mundo</p>',
        updatedAt: FIXED_NOW.getTime() + 1,
      }),
    ]
    const third = buildSearchIndex(spaces, changedPages)
    expect(third).not.toBe(first)
  })
})
