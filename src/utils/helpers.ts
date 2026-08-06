import type { Space } from '../storage/db'

export function isSpaceArchived(space: Space): boolean {
  return space.archived === true
}

/** @deprecated Use isSpaceArchived */
export const isNotebookArchived = isSpaceArchived

export function formatLastSavedDisplay(ts: number): string {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(ts))
}
