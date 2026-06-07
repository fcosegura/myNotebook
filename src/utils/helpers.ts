import type { Notebook } from '../storage/db'

export function isNotebookArchived(notebook: Notebook): boolean {
  return notebook.archived === true
}

export function formatLastSavedDisplay(ts: number): string {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(ts))
}
