import type { ClipboardEvent, FormEvent, MouseEvent, RefObject } from 'react'
import type { Attachment, Page } from '../storage/db'
import { CloudSaveIcon, ListBulletIcon, ListNumberIcon, NotebookEmptyIcon, PageEmptyIcon, QuoteIcon, RedoIcon, UndoIcon } from './icons'
import { AttachmentsPanel } from './AttachmentsPanel'

type EditorCommand = 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'underline' | 'strikeThrough' | 'foreColor'
type EditorBlockFormat = 'P' | 'H1' | 'H2' | 'H3'
type EditorFormatState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strikeThrough: boolean
  unorderedList: boolean
  orderedList: boolean
  blockquote: boolean
  block: EditorBlockFormat
}

type EditorPanelProps = {
  selectedNotebookId: string | null
  selectedNotebookTitle: string | null
  selectedPage: Page | null
  selectedPageAttachments: Attachment[]
  readOnly: boolean
  editorRef: RefObject<HTMLDivElement | null>
  editorTitleRef: RefObject<HTMLInputElement | null>
  isCurrentPageBookmarked: boolean
  lastSavedAt: number | null
  forceSavePending: boolean
  pastingImage: boolean
  formatMenuOpen: boolean
  textColorPalette: string[]
  editorFormatState: EditorFormatState
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
  onCloseFormatMenu: () => void
  onApplyEditorBlockFormat: (format: EditorBlockFormat) => void
  onApplySelectionFontSizeStep: (stepDelta: number) => void
  onApplyEditorBlockquote: () => void
  onClearEditorFormat: () => void
  onInsertHorizontalRule: () => void
  onCreateOrEditLink: () => void
  onEditorInput: (event: FormEvent<HTMLDivElement>) => void
  onEditorRichTextClick: (event: MouseEvent<HTMLDivElement>) => void
  onProcessImagePaste: (event: ClipboardEvent<HTMLDivElement>) => void
  onOpenAttachmentModal: (attachment: Attachment) => void
  onCopyAttachmentReference: (attachment: Attachment) => void
  onRemoveAttachment: (attachmentId: string) => void
  pwaTaskId?: string
  onOpenPwaTask?: (taskId: string) => void
}

export function EditorPanel({
  selectedNotebookId,
  selectedNotebookTitle,
  selectedPage,
  selectedPageAttachments,
  readOnly,
  editorRef,
  editorTitleRef,
  isCurrentPageBookmarked,
  lastSavedAt,
  forceSavePending,
  pastingImage,
  formatMenuOpen,
  textColorPalette,
  editorFormatState,
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
  onCloseFormatMenu,
  onApplyEditorBlockFormat,
  onApplySelectionFontSizeStep,
  onApplyEditorBlockquote,
  onClearEditorFormat,
  onInsertHorizontalRule,
  onCreateOrEditLink,
  onEditorInput,
  onEditorRichTextClick,
  onProcessImagePaste,
  onOpenAttachmentModal,
  onCopyAttachmentReference,
  onRemoveAttachment,
  pwaTaskId,
  onOpenPwaTask,
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
              <span className="editor-context-notebook">
                📒 {selectedNotebookTitle ?? 'Libreta'}
                {pwaTaskId && onOpenPwaTask && (
                  <button
                    type="button"
                    onClick={() => onOpenPwaTask(pwaTaskId)}
                    className="pwa-backlink-btn"
                    title="Ver tarea correspondiente en taskmanagerpwa"
                    style={{
                      marginLeft: '10px',
                      background: 'rgba(37, 99, 235, 0.1)',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#2563eb',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    Ver tarea en PWA ↗
                  </button>
                )}
              </span>
              {readOnly ? <span className="editor-readonly-badge">Archivo · solo lectura</span> : null}
              <div className="editor-context-actions" aria-label="Acciones de página">
                <button type="button" onClick={onSelectPreviousPage} disabled={!canMoveToPreviousPage} title="Página anterior">‹</button>
                <button type="button" onClick={onSelectNextPage} disabled={!canMoveToNextPage} title="Página siguiente">›</button>
                <button type="button" onClick={onMovePage} disabled={readOnly} title={readOnly ? 'Archivo de solo lectura' : 'Mover'}>Mover</button>
                <button type="button" className="favorite-context-action" disabled={readOnly} title={readOnly ? 'Archivo de solo lectura' : undefined} onClick={onPageBookmark}>
                  {isCurrentPageBookmarked ? 'Favorita' : 'Marcar favorita'}
                </button>
                <button type="button" className="danger-soft-action" disabled={readOnly} title={readOnly ? 'Archivo de solo lectura' : 'Eliminar'} onClick={onPageDelete}>Eliminar</button>
              </div>
            </div>
            <div className="editor-header">
              <input
                ref={editorTitleRef}
                className="editor-title"
                value={selectedPage.title}
                readOnly={readOnly}
                title={readOnly ? 'Archivo de solo lectura' : undefined}
                onChange={(event) => {
                  onPageTitleChange(event.target.value)
                }}
              />
              <div className="editor-header-actions">
                <button
                  type="button"
                  className={`editor-icon-button save-icon${lastSavedAt !== null ? ' saved' : ''}`}
                  disabled={forceSavePending || pastingImage || readOnly}
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
              <div
                className="editor-format-toolbar editor-format-toolbar-compact"
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
              >
                <div className="toolbar-group editor-history-group" role="group" aria-label="Deshacer y rehacer">
                  <button type="button" className="toolbar-icon-btn" disabled={readOnly} onClick={() => onApplyEditorHistory('undo')} title="Deshacer (Ctrl/Cmd+Z)" aria-label="Deshacer"><UndoIcon /></button>
                  <button type="button" className="toolbar-icon-btn" disabled={readOnly} onClick={() => onApplyEditorHistory('redo')} title="Rehacer (Ctrl/Cmd+Shift+Z)" aria-label="Rehacer"><RedoIcon /></button>
                </div>
                <div className="toolbar-group" role="group" aria-label="Formato básico">
                  <button type="button" className={`toolbar-icon-btn${editorFormatState.bold ? ' is-active' : ''}`} disabled={readOnly} aria-pressed={editorFormatState.bold} onClick={() => onApplyEditorCommand('bold')} title="Negrita (Ctrl/Cmd+B)" aria-label="Negrita"><strong>B</strong></button>
                  <button type="button" className={`toolbar-icon-btn${editorFormatState.italic ? ' is-active' : ''}`} disabled={readOnly} aria-pressed={editorFormatState.italic} onClick={() => onApplyEditorCommand('italic')} title="Cursiva (Ctrl/Cmd+I)" aria-label="Cursiva"><em>I</em></button>
                  <button type="button" className={`toolbar-icon-btn${editorFormatState.unorderedList ? ' is-active' : ''}`} disabled={readOnly} aria-pressed={editorFormatState.unorderedList} onClick={() => onApplyEditorCommand('insertUnorderedList')} title="Lista con viñetas (Ctrl/Cmd+Shift+8)" aria-label="Lista con viñetas"><ListBulletIcon /></button>
                  <button type="button" className={`toolbar-icon-btn${editorFormatState.orderedList ? ' is-active' : ''}`} disabled={readOnly} aria-pressed={editorFormatState.orderedList} onClick={() => onApplyEditorCommand('insertOrderedList')} title="Lista numerada (Ctrl/Cmd+Shift+7)" aria-label="Lista numerada"><ListNumberIcon /></button>
                </div>
                <div
                  className="editor-format-menu-wrap"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      onCloseFormatMenu()
                    }
                  }}
                >
                  <button
                    type="button"
                    className={`toolbar-format-trigger${formatMenuOpen ? ' is-open' : ''}`}
                    disabled={readOnly}
                    onClick={onToggleFormatMenu}
                    aria-expanded={formatMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Opciones de formato"
                  >
                    <span>Más</span>
                    <span className="toolbar-chevron" aria-hidden="true" />
                  </button>
                  {formatMenuOpen ? (
                    <div className="editor-format-popover" role="menu" aria-label="Opciones de formato">
                      <section className="format-popover-section" aria-label="Estructura de texto">
                        <p className="format-popover-label">Estructura</p>
                        <div className="format-block-grid" role="group" aria-label="Estructura de texto">
                          <button type="button" disabled={readOnly} className={editorFormatState.block === 'P' ? 'is-active' : ''} aria-pressed={editorFormatState.block === 'P'} onClick={() => onApplyEditorBlockFormat('P')}>Normal</button>
                          <button type="button" disabled={readOnly} className={editorFormatState.block === 'H1' ? 'is-active' : ''} aria-pressed={editorFormatState.block === 'H1'} onClick={() => onApplyEditorBlockFormat('H1')}>H1</button>
                          <button type="button" disabled={readOnly} className={editorFormatState.block === 'H2' ? 'is-active' : ''} aria-pressed={editorFormatState.block === 'H2'} onClick={() => onApplyEditorBlockFormat('H2')}>H2</button>
                          <button type="button" disabled={readOnly} className={editorFormatState.block === 'H3' ? 'is-active' : ''} aria-pressed={editorFormatState.block === 'H3'} onClick={() => onApplyEditorBlockFormat('H3')}>H3</button>
                        </div>
                      </section>
                      <section className="format-popover-section" aria-label="Estilos inline">
                        <p className="format-popover-label">Estilos</p>
                        <div className="format-popover-row" role="group" aria-label="Estilos inline">
                          <button type="button" disabled={readOnly} className={`toolbar-icon-btn${editorFormatState.underline ? ' is-active' : ''}`} aria-pressed={editorFormatState.underline} onClick={() => onApplyEditorCommand('underline')} title="Subrayado (Ctrl/Cmd+U)" aria-label="Subrayado"><span className="toolbar-underline">U</span></button>
                          <button type="button" disabled={readOnly} className={`toolbar-icon-btn${editorFormatState.strikeThrough ? ' is-active' : ''}`} aria-pressed={editorFormatState.strikeThrough} onClick={() => onApplyEditorCommand('strikeThrough')} title="Tachado" aria-label="Tachado"><span className="toolbar-strike">S</span></button>
                          <button type="button" disabled={readOnly} className={`toolbar-icon-btn${editorFormatState.blockquote ? ' is-active' : ''}`} aria-pressed={editorFormatState.blockquote} onClick={onApplyEditorBlockquote} title="Cita" aria-label="Alternar cita"><QuoteIcon /></button>
                          <button type="button" disabled={readOnly} className="toolbar-text-btn" onClick={onCreateOrEditLink} title="Crear o editar enlace" aria-label="Crear o editar enlace">Link</button>
                        </div>
                      </section>
                      <section className="format-popover-section" aria-label="Tamaño del texto">
                        <p className="format-popover-label">Tamaño</p>
                        <div className="format-popover-row compact" role="group" aria-label="Tamaño del texto">
                          <button type="button" disabled={readOnly} className="toolbar-icon-btn font-size-step" onClick={() => onApplySelectionFontSizeStep(-3)} title="Reducir tamaño" aria-label="Reducir tamaño del texto">A−</button>
                          <button type="button" disabled={readOnly} className="toolbar-icon-btn font-size-step" onClick={() => onApplySelectionFontSizeStep(3)} title="Aumentar tamaño" aria-label="Aumentar tamaño del texto">A+</button>
                        </div>
                      </section>
                      <section className="format-popover-section" aria-label="Color del texto">
                        <p className="format-popover-label">Color</p>
                        <div className="editor-color-palette" role="group" aria-label="Color del texto">
                          {textColorPalette.map((color) => (
                            <button key={color} type="button" disabled={readOnly} className="color-swatch" style={{ backgroundColor: color }} onClick={() => onApplyEditorCommand('foreColor', color)} title={`Color ${color}`} aria-label={`Aplicar color ${color}`} />
                          ))}
                        </div>
                      </section>
                      <div className="format-popover-divider" />
                      <div className="format-popover-row secondary" role="group" aria-label="Acciones secundarias">
                        <button type="button" disabled={readOnly} className="toolbar-text-btn" onClick={onInsertHorizontalRule} title="Insertar separador" aria-label="Insertar separador">Divisor</button>
                        <button type="button" disabled={readOnly} className="toolbar-text-btn" onClick={onClearEditorFormat} title="Limpiar formato" aria-label="Limpiar formato">Limpiar</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div
                ref={editorRef}
                className="editor-richtext"
                contentEditable={!readOnly}
                aria-readonly={readOnly}
                suppressContentEditableWarning
                data-placeholder={readOnly ? 'Archivo de solo lectura.' : 'Escribe tu nota aqui. Puedes pegar imagenes desde portapapeles.'}
                onInput={onEditorInput}
                onClick={onEditorRichTextClick}
                onPaste={(event) => { onProcessImagePaste(event) }}
              />
              <footer className="editor-footer-tip" role="status">
                {readOnly ? 'Archivo de solo lectura: puedes consultar y copiar, no editar.' : pastingImage ? 'Procesando screenshot...' : 'Tip: pega screenshot con Ctrl/Cmd + V o crea otra página con + Página'}
              </footer>
            </section>
            <AttachmentsPanel
              attachments={selectedPageAttachments}
              readOnly={readOnly}
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
