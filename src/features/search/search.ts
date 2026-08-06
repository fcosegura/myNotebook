import MiniSearch from 'minisearch'
import type { Page, Space } from '../../storage/db'

type SearchDoc = {
  id: string
  spaceId: string
  spaceTitle: string
  pageTitle: string
  content: string
  tags: string
  updatedAt: number
  createdAt: number
}

export type DateFilterLabel =
  | 'Hoy'
  | 'Ayer'
  | 'Esta semana'
  | 'La semana pasada'
  | 'Este mes'

export type DateRange = {
  start: number
  end: number
  label: DateFilterLabel
}

export type ParsedSearchQuery = {
  lexicalQuery: string
  dateRange: DateRange | null
}

export type SearchResult = {
  pageId: string
  spaceId: string
  spaceTitle: string
  pageTitle: string
  snippet: string
  score: number
}

const ES_STOPWORDS = new Set([
  'a', 'al', 'algo', 'algunas', 'algunos', 'ante', 'antes', 'como', 'con', 'contra',
  'cual', 'cuando', 'de', 'del', 'desde', 'donde', 'durante', 'e', 'el', 'ella',
  'ellas', 'ellos', 'en', 'entre', 'era', 'es', 'esa', 'esas', 'ese', 'eso', 'esos',
  'esta', 'estas', 'este', 'esto', 'estos', 'fue', 'ha', 'hay', 'la', 'las', 'le',
  'les', 'lo', 'los', 'mas', 'más', 'me', 'mi', 'mis', 'mucho', 'muy', 'ni', 'no',
  'nos', 'o', 'para', 'pero', 'por', 'porque', 'que', 'qué', 'se', 'si', 'sí',
  'sin', 'sobre', 'su', 'sus', 'te', 'tu', 'tus', 'un', 'una', 'uno', 'unos', 'y',
  'ya', 'yo',
])

type CachedSearchIndex = {
  signature: string
  index: MiniSearch<SearchDoc>
  documents: SearchDoc[]
}

let cachedSearchIndex: CachedSearchIndex | null = null

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

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  return startOfLocalDay(addDays(date, mondayOffset))
}

function foldToken(token: string): string {
  return token.normalize('NFD').replace(/\p{M}/gu, '')
}

function isStopword(token: string): boolean {
  return ES_STOPWORDS.has(token) || ES_STOPWORDS.has(foldToken(token))
}

/** Extrae filtros temporales en español y limpia stopwords del resto. */
export function parseSearchQuery(raw: string, now: Date = new Date()): ParsedSearchQuery {
  let remaining = raw.trim()
  if (!remaining) {
    return { lexicalQuery: '', dateRange: null }
  }

  const todayStart = startOfLocalDay(now)
  const patterns: Array<{ regex: RegExp; range: () => DateRange }> = [
    {
      regex: /\bla\s+semana\s+pasada\b/gi,
      range: () => {
        const thisWeekStart = startOfWeekMonday(todayStart)
        const start = addDays(thisWeekStart, -7)
        return { start: start.getTime(), end: thisWeekStart.getTime() - 1, label: 'La semana pasada' }
      },
    },
    {
      regex: /\besta\s+semana\b/gi,
      range: () => {
        const start = startOfWeekMonday(todayStart)
        const end = addDays(start, 7)
        return { start: start.getTime(), end: end.getTime() - 1, label: 'Esta semana' }
      },
    },
    {
      regex: /\beste\s+mes\b/gi,
      range: () => {
        const start = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1)
        const end = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1)
        return { start: start.getTime(), end: end.getTime() - 1, label: 'Este mes' }
      },
    },
    {
      regex: /\bhoy\b/gi,
      range: () => {
        const end = addDays(todayStart, 1)
        return { start: todayStart.getTime(), end: end.getTime() - 1, label: 'Hoy' }
      },
    },
    {
      regex: /\bayer\b/gi,
      range: () => {
        const start = addDays(todayStart, -1)
        return { start: start.getTime(), end: todayStart.getTime() - 1, label: 'Ayer' }
      },
    },
  ]

  let dateRange: DateRange | null = null
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0
    if (pattern.regex.test(remaining)) {
      dateRange = pattern.range()
      remaining = remaining.replace(new RegExp(pattern.regex.source, 'gi'), ' ')
      break
    }
  }

  const lexicalQuery = remaining
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !isStopword(token))
    .join(' ')
    .trim()

  return { lexicalQuery, dateRange }
}

export function getParsedDateFilterLabel(term: string, now: Date = new Date()): DateFilterLabel | null {
  return parseSearchQuery(term, now).dateRange?.label ?? null
}

function buildIndexSignature(spaces: Space[], pages: Page[]): string {
  const spacesSig = spaces
    .map((space) => `${space.id}:${space.updatedAt}:${space.title}`)
    .sort()
    .join('|')
  const pagesSig = pages
    .map((page) => `${page.id}:${page.updatedAt}:${page.title.length}:${page.content.length}:${page.tags.join(',')}`)
    .sort()
    .join('|')
  return `${spacesSig}::${pagesSig}`
}

export function buildSearchIndex(spaces: Space[], pages: Page[]): MiniSearch<SearchDoc> {
  const signature = buildIndexSignature(spaces, pages)
  if (cachedSearchIndex && cachedSearchIndex.signature === signature) {
    return cachedSearchIndex.index
  }

  const spaceMap = new Map(spaces.map((space) => [space.id, space]))
  const documents: SearchDoc[] = pages.map((page) => ({
    id: page.id,
    spaceId: page.spaceId,
    spaceTitle: spaceMap.get(page.spaceId)?.title ?? 'Sin espacio',
    pageTitle: page.title,
    content: htmlToSearchText(page.content),
    tags: page.tags.join(' '),
    updatedAt: page.updatedAt,
    createdAt: page.createdAt,
  }))

  const miniSearch = new MiniSearch<SearchDoc>({
    fields: ['spaceTitle', 'pageTitle', 'content', 'tags'],
    storeFields: ['spaceId', 'spaceTitle', 'pageTitle', 'content', 'updatedAt', 'createdAt'],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
      boost: { pageTitle: 3, spaceTitle: 2.4, tags: 2, content: 1 },
    },
  })

  miniSearch.addAll(documents)
  cachedSearchIndex = { signature, index: miniSearch, documents }
  return miniSearch
}

/** Invalida la cache del indice (tests / logout). */
export function clearSearchIndexCache(): void {
  cachedSearchIndex = null
}

function getCachedDocuments(index: MiniSearch<SearchDoc>): SearchDoc[] {
  if (cachedSearchIndex && cachedSearchIndex.index === index) {
    return cachedSearchIndex.documents
  }
  return []
}

function snippetAroundMatch(content: string, query: string, maxLen = 120): string {
  if (!content) {
    return ''
  }
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) {
    return content.slice(0, maxLen)
  }

  const lower = content.toLowerCase()
  let bestIndex = -1
  for (const token of tokens) {
    const index = lower.indexOf(token)
    if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
      bestIndex = index
    }
  }

  if (bestIndex < 0) {
    return content.slice(0, maxLen)
  }

  const half = Math.floor(maxLen / 2)
  const start = Math.max(0, bestIndex - half)
  const end = Math.min(content.length, start + maxLen)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  return `${prefix}${content.slice(start, end).trim()}${suffix}`
}

function pageTouchesRange(updatedAt: number, createdAt: number, range: DateRange): boolean {
  return (
    (updatedAt >= range.start && updatedAt <= range.end) ||
    (createdAt >= range.start && createdAt <= range.end)
  )
}

export function querySearch(
  index: MiniSearch<SearchDoc>,
  term: string,
  now: Date = new Date(),
): SearchResult[] {
  const parsed = parseSearchQuery(term, now)
  if (!parsed.lexicalQuery && !parsed.dateRange) {
    return []
  }

  const nowMs = now.getTime()
  const recencyWindow = 1000 * 60 * 60 * 24 * 15

  type ScoredDoc = SearchDoc & { score: number }
  let rawResults: ScoredDoc[]

  if (parsed.lexicalQuery) {
    rawResults = index.search(parsed.lexicalQuery).map((result) => ({
      id: String(result.id),
      spaceId: String(result.spaceId),
      spaceTitle: String(result.spaceTitle),
      pageTitle: String(result.pageTitle),
      content: String(result.content ?? ''),
      tags: '',
      updatedAt: Number(result.updatedAt ?? 0),
      createdAt: Number(result.createdAt ?? 0),
      score: Number(result.score),
    }))
  } else {
    rawResults = getCachedDocuments(index).map((doc) => ({ ...doc, score: 1 }))
  }

  const filtered = parsed.dateRange
    ? rawResults.filter((result) => pageTouchesRange(result.updatedAt, result.createdAt, parsed.dateRange!))
    : rawResults

  return filtered
    .map((result) => {
      const recencyBoost = 1 + Math.max(0, (recencyWindow - (nowMs - result.updatedAt)) / recencyWindow)
      let score = result.score * recencyBoost

      if (parsed.lexicalQuery) {
        const spaceTitleLower = result.spaceTitle.toLowerCase()
        for (const token of parsed.lexicalQuery.toLowerCase().split(/\s+/)) {
          if (token && spaceTitleLower.includes(token)) {
            score *= 1.15
            break
          }
        }
      }

      return {
        pageId: result.id,
        spaceId: result.spaceId,
        spaceTitle: result.spaceTitle,
        pageTitle: result.pageTitle,
        snippet: snippetAroundMatch(result.content, parsed.lexicalQuery),
        score,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
}
