import MiniSearch from 'minisearch'
import { extractCanvasSearchText } from '../canvas/serialize'
import type { Notebook, Page } from '../../storage/db'

type SearchDoc = {
  id: string
  notebookId: string
  notebookTitle: string
  pageTitle: string
  content: string
  tags: string
  updatedAt: number
}

export type SearchResult = {
  pageId: string
  notebookId: string
  notebookTitle: string
  pageTitle: string
  snippet: string
  score: number
}

export function buildSearchIndex(notebooks: Notebook[], pages: Page[]) {
  const notebookMap = new Map(notebooks.map((notebook) => [notebook.id, notebook]))

  const miniSearch = new MiniSearch<SearchDoc>({
    fields: ['notebookTitle', 'pageTitle', 'content', 'tags'],
    storeFields: ['notebookId', 'notebookTitle', 'pageTitle', 'content', 'updatedAt'],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
      boost: { pageTitle: 3, notebookTitle: 2.2, tags: 2, content: 1 },
    },
  })

  miniSearch.addAll(
    pages.map((page) => ({
      id: page.id,
      notebookId: page.notebookId,
      notebookTitle: notebookMap.get(page.notebookId)?.title ?? 'Sin libreta',
      pageTitle: page.title,
      content: getSearchableContent(page),
      tags: page.tags.join(' '),
      updatedAt: page.updatedAt,
    })),
  )

  return miniSearch
}

function getSearchableContent(page: Page): string {
  if (page.pageType === 'canvas') {
    return extractCanvasSearchText(page.content)
  }
  return page.content
}

export function querySearch(index: MiniSearch<SearchDoc>, term: string): SearchResult[] {
  if (!term.trim()) {
    return []
  }

  const now = Date.now()
  const recencyWindow = 1000 * 60 * 60 * 24 * 15

  return index.search(term).map((result) => {
    const updatedAt = Number(result.updatedAt ?? 0)
    const recencyBoost = 1 + Math.max(0, (recencyWindow - (now - updatedAt)) / recencyWindow)
    const score = Number(result.score) * recencyBoost

    return {
      pageId: String(result.id),
      notebookId: String(result.notebookId),
      notebookTitle: String(result.notebookTitle),
      pageTitle: String(result.pageTitle),
      snippet: String(result.content).slice(0, 120),
      score,
    }
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
}
