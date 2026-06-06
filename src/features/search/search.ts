import MiniSearch from 'minisearch'
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

function decodeHtmlEntities(value: string): string {
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = value
    return textarea.value
  }

  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function htmlToSearchText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(div|p|li|h[1-6]|blockquote)>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
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
      content: htmlToSearchText(page.content),
      tags: page.tags.join(' '),
      updatedAt: page.updatedAt,
    })),
  )

  return miniSearch
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
