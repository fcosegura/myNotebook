import type { ClipboardEvent, FormEvent, MouseEvent, RefObject } from 'react'
import type { Attachment, Page } from '../storage/db'
import { CloudSaveIcon, ListBulletIcon, ListNumberIcon, NotebookEmptyIcon, PageEmptyIcon, QuoteIcon, RedoIcon, UndoIcon } from './icons'
import { AttachmentsPanel } from './AttachmentsPanel'

type EditorCommand = 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'underline' | 'strikeThrough' | 'foreColor'

type EditorPanelProps = {
  selectedNotebookId: string | null
  selectedNotebookTitle: string | null
  selectedPage: Page | null
  selectedPageAttachments: Attachment[]
  editorRef: RefObject<HTMLDivElement | null>
  editorTitleRef: RefObject<HTMLInputElement | null>
  isCurrentPageBookmarked: boolean
  lastSavedAt: number | null
  forceSavePending: boolean
  pastingImage: boolean
  formatMenuOpen: boolean
  textColorPalette: string[]
  saveStatusLabel: string
  canMoveToPreviousPage: boolean
  canMoveToNextPage: boolean
  onCreateNotebook: () => void
  onCreatePage: () => void
  onShowBookmarks: () => void
  onMovePage: () => void
  onSelectPreviousPage: () => void
  onSelectNextPage: () => void
  onPageDelete: () => void
  onPageTitleChange: (value: string) => void
  onPageBookmark: () => void
  onForceSaveNote: () => void
  formatLastSavedDisplay: (ts: number) => string
  onApplyEditorHistory: (action: 'undo' | 'redo') => void
  onApplyEditorCommand: (command: EditorCommand, value?: string) => void
  onToggleFormatMenu: () => void
  onApplySelectionFontSizeStep: (stepDelta: number) => void
  onApplyEditorBlockquote: () => void
  onEditorInput: (event: FormEvent<HTMLDivElement>) => void
  onEditorRichTextClick: (event: MouseEvent<HTMLDivElement>) => void
  onProcessImagePaste: (event: ClipboardEvent<HTMLDivElement>) => void
  onOpenAttachmentModal: (attachment: Attachment) => void
  onCopyAttachmentReference: (attachment: Attachment) => void
  onRemoveAttachment: (attachmentId: string) => void
}

export function EditorPanel({
  selectedNotebookId,
  selectedNotebookTitle,
  selectedPage,
  selectedPageAttachments,
  editorRef,
  editorTitleRef,
  isCurrentPageBookmarked,
  lastSavedAt,
  forceSavePending,
  pastingImage,
  formatMenuOpen,
  textColorPalette,
  saveStatusLabel,
  canMoveToPreviousPage,
  canMoveToNextPage,
  onCreateNotebook,
  onCreatePage,
  onShowBookmarks,
  onMovePage,
  onSelectPreviousPage,
  onSelectNextPage,
  onPageDelete,
  onPageTitleChange,
  onPageBookmark,
  onForceSaveNote,
  formatLastSavedDisplay,
  onApplyEditorHistory,
  onApplyEditorCommand,
  onToggleFormatMenu,
  onApplySelectionFontSizeStep,
  onApplyEditorBlockquote,
  onEditorInput,
  onEditorRichTextClick,
  onProcessImagePaste,
  onOpenAttachmentModal,
  onCopyAttachmentReference,
  onRemoveAttachment,
}: EditorPanelProps) {
  return (
    <section className="workspace-panel">
      <article className="column editor master-detail-main">
        {!selectedNotebookId ? (
          <div className="workspace-empty-state" role="status">
            <NotebookEmptyIcon />
            <h2>Tu espacio está listo para moverse.</h2>
            <p className="workspace-empty-text">
              Selecciona una libreta, crea una nueva o salta a tus favoritas.
            </p>
            <div className="workspace-empty-actions">
              <button type="button" className="primary" onClick={onCreateNotebook}>Crear libreta</button>
              <button type="button" onClick={onShowBookmarks}>Ver favoritas</button>
            </div>
          </div>
        ) : !selectedPage ? (
          <div className="workspace-empty-state" role="status">
            <PageEmptyIcon />
            <h2>{selectedNotebookTitle ?? 'Libreta'} está esperando una idea.</h2>
            <p className="workspace-empty-text">Crea una página rápida y empieza a escribir sin pasar por formularios.</p>
            <div className="workspace-empty-actions">
              <button type="button" className="primary" onClick={onCreatePage}>Crear primera página</button>
              <button type="button" onClick={onShowBookmarks}>Ver favoritas</button>
            </div>
          </div>
        ) : (
          <>
            <div className="editor-context-row">
              <span className="editor-context-notebook">📒 {selectedNotebookTitle ?? 'Libreta'}</span>
              <div className="editor-context-actions" aria-label="Acciones de página">
                <button type="button" onClick={onSelectPreviousPage} disabled={!canMoveToPreviousPage} title="Página anterior">‹</button>
                <button type="button" onClick={onSelectNextPage} disabled={!canMoveToNextPage} title="Página siguiente">›</button>
                <button type="button" onClick={onMovePage}>Mover</button>
                <button type="button" onClick={onPageBookmark}>
                  {isCurrentPageBookmarked ? 'Favorita' : 'Marcar favorita'}
                </button>
                <button type="button" className="danger-soft-action" onClick={onPageDelete}>Eliminar</button>
              </div>
            </div>
            <div className="editor-header">
              <input
                ref={editorTitleRef}
                className="editor-title"
                value={selectedPage.title}
                onChange={(event) => {
                  onPageTitleChange(event.target.value)
                }}
              />
              <div className="editor-header-actions">
                <button
                  type="button"
                  className={`editor-icon-button save-icon${lastSavedAt !== null ? ' saved' : ''}`}
                  disabled={forceSavePending || pastingImage}
                  onClick={onForceSaveNote}
                  title={
                    forceSavePending
                      ? 'Guardando...'
                      : lastSavedAt !== null
                        ? `Guardado ${formatLastSavedDisplay(lastSavedAt)}`
                        : 'Guardar nota (Ctrl/Cmd + S)'
                  }
                  aria-label="Guardar nota"
                >
                  <CloudSaveIcon saving={forceSavePending} saved={lastSavedAt !== null} />
                </button>
                <span className={`save-status-pill${forceSavePending ? ' is-saving' : lastSavedAt !== null ? ' is-saved' : ''}`}>
                  {saveStatusLabel}
                </span>
              </div>
            </div>
            <section className="editor-richtext-shell" aria-label="Editor de contenido enriquecido">
              <div className="editor-format-toolbar editor-format-toolbar-compact">
                <div className="editor-history-group" role="group" aria-label="Deshacer y rehacer">
                  <button type="button" className="toolbar-icon-btn" onClick={() => onApplyEditorHistory('undo')} title="Deshacer (Ctrl/Cmd+Z)" aria-label="Deshacer"><UndoIcon /></button>
                  <button type="button" className="toolbar-icon-btn" onClick={() => onApplyEditorHistory('redo')} title="Rehacer (Ctrl/Cmd+Shift+Z)" aria-label="Rehacer"><RedoIcon /></button>
                </div>
                <button type="button" className="toolbar-icon-btn" onClick={() => onApplyEditorCommand('bold')} title="Negrita (Ctrl/Cmd+B)" aria-label="Negrita"><strong>B</strong></button>
                <button type="button" className="toolbar-icon-btn" onClick={() => onApplyEditorCommand('italic')} title="Cursiva (Ctrl/Cmd+I)" aria-label="Cursiva"><em>I</em></button>
                <button type="button" className="toolbar-icon-btn" onClick={() => onApplyEditorCommand('insertUnorderedList')} title="Lista con viñetas" aria-label="Lista con viñetas"><ListBulletIcon /></button>
                <button type="button" className="toolbar-icon-btn" onClick={() => onApplyEditorCommand('insertOrderedList')} title="Lista numerada" aria-label="Lista numerada"><ListNumberIcon /></button>
                <div className="editor-format-menu-wrap" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className={`toolbar-format-trigger${formatMenuOpen ? ' is-open' : ''}`}
                    onClick={onToggleFormatMenu}
                    aria-expanded={formatMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Opciones de formato"
                  >
                    Formato
                  </button>
                  {formatMenuOpen ? (
                    <div className="editor-format-popover" role="menu" aria-label="Opciones de formato">
                      <div className="format-popover-row" role="group" aria-label="Tamaño del texto">
                        <button type="button" className="toolbar-icon-btn font-size-step" onClick={() => onApplySelectionFontSizeStep(-3)} title="Reducir tamaño" aria-label="Reducir tamaño del texto">A−</button>
                        <button type="button" className="toolbar-icon-btn font-size-step" onClick={() => onApplySelectionFontSizeStep(3)} title="Aumentar tamaño" aria-label="Aumentar tamaño del texto">A+</button>
                      </div>
                      <div className="format-popover-row" role="group" aria-label="Estilos secundarios">
                        <button type="button" className="toolbar-icon-btn" onClick={onApplyEditorBlockquote} title="Cita" aria-label="Alternar cita"><QuoteIcon /></button>
                        <button type="button" className="toolbar-icon-btn" onClick={() => onApplyEditorCommand('underline')} title="Subrayado" aria-label="Subrayado"><span className="toolbar-underline">U</span></button>
                        <button type="button" className="toolbar-icon-btn" onClick={() => onApplyEditorCommand('strikeThrough')} title="Tachado" aria-label="Tachado"><span className="toolbar-strike">S</span></button>
                      </div>
                      <div className="editor-color-palette" role="group" aria-label="Color del texto">
                        {textColorPalette.map((color) => (
                          <button key={color} type="button" className="color-swatch" style={{ backgroundColor: color }} onClick={() => onApplyEditorCommand('foreColor', color)} title={`Color ${color}`} aria-label={`Aplicar color ${color}`} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div
                ref={editorRef}
                className="editor-richtext"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Escribe tu nota aqui. Puedes pegar imagenes desde portapapeles."
                onInput={onEditorInput}
                onClick={onEditorRichTextClick}
                onPaste={(event) => { onProcessImagePaste(event) }}
              />
              <footer className="editor-footer-tip" role="status">
                {pastingImage ? 'Procesando screenshot...' : 'Tip: pega screenshot con Ctrl/Cmd + V o crea otra página con + Página'}
              </footer>
            </section>
            <AttachmentsPanel
              attachments={selectedPageAttachments}
              onOpenAttachmentModal={onOpenAttachmentModal}
              onCopyAttachmentReference={onCopyAttachmentReference}
              onRemoveAttachment={onRemoveAttachment}
            />
          </>
        )}
      </article>
    </section>
  )
}
