import type { Attachment, Page } from '../storage/db'

export type DialogTone = 'neutral' | 'danger'

export type BaseAppDialog = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: DialogTone
}

export type TextDialogConfig = {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  placeholder?: string
  initialValue?: string
  tone?: DialogTone
}

export type ConfirmDialogConfig = {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  tone?: DialogTone
}

export type AlertDialogConfig = {
  title: string
  message?: string
  confirmLabel?: string
  tone?: DialogTone
}

export type TextAppDialog = BaseAppDialog & {
  kind: 'text'
  confirmLabel: string
  placeholder?: string
}

export type ConfirmAppDialog = BaseAppDialog & {
  kind: 'confirm'
  confirmLabel: string
}

export type AlertAppDialog = BaseAppDialog & {
  kind: 'alert'
}

export type AppDialogState = TextAppDialog | ConfirmAppDialog | AlertAppDialog

type AppDialogProps = {
  dialog: AppDialogState | null
  input: string
  onInputChange: (value: string) => void
  onClose: (value: string | boolean | null) => void
}

export function AppDialog({ dialog, input, onInputChange, onClose }: AppDialogProps) {
  if (!dialog) {
    return null
  }

  const toneClass = dialog.tone === 'danger' ? 'danger' : 'neutral'
  const message = dialog.message ?? ''

  if (dialog.kind === 'alert') {
    return (
      <section className="app-dialog-backdrop" role="presentation">
        <div className={`app-dialog ${toneClass}`} role="alertdialog" aria-modal="true" aria-label={dialog.title}>
          <h2>{dialog.title}</h2>
          {message ? <p>{message}</p> : null}
          <div className="app-dialog-actions">
            <button type="button" className="primary" onClick={() => onClose(true)}>
              {dialog.confirmLabel ?? 'Entendido'}
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (dialog.kind === 'confirm') {
    return (
      <section className="app-dialog-backdrop" role="presentation">
        <div className={`app-dialog ${toneClass}`} role="dialog" aria-modal="true" aria-label={dialog.title}>
          <h2>{dialog.title}</h2>
          {message ? <p>{message}</p> : null}
          <div className="app-dialog-actions">
            <button type="button" onClick={() => onClose(false)}>
              {dialog.cancelLabel ?? 'Cancelar'}
            </button>
            <button type="button" className="primary" onClick={() => onClose(true)}>
              {dialog.confirmLabel}
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="app-dialog-backdrop" role="presentation">
      <div className={`app-dialog ${toneClass}`} role="dialog" aria-modal="true" aria-label={dialog.title}>
        <h2>{dialog.title}</h2>
        {message ? <p>{message}</p> : null}
        <input
          value={input}
          autoFocus
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={dialog.placeholder ?? ''}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onClose(input.trim() || null)
            }
            if (event.key === 'Escape') {
              onClose(null)
            }
          }}
        />
        <div className="app-dialog-actions">
          <button type="button" onClick={() => onClose(null)}>
            {dialog.cancelLabel ?? 'Cancelar'}
          </button>
          <button type="button" className="primary" onClick={() => onClose(input.trim() || null)}>
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </section>
  )
}

type SecretDialogProps = {
  dialog: { title: string; confirmLabel: string } | null
  input: string
  visible: boolean
  onInputChange: (value: string) => void
  onVisibleChange: (visible: boolean) => void
  onClose: (value: string | null) => void
}

export function SecretDialog({ dialog, input, visible, onInputChange, onVisibleChange, onClose }: SecretDialogProps) {
  if (!dialog) {
    return null
  }

  return (
    <section className="secret-dialog-backdrop" role="presentation">
      <div className="secret-dialog" role="dialog" aria-modal="true" aria-label={dialog.title}>
        <h2>{dialog.title}</h2>
        <input
          value={input}
          type={visible ? 'text' : 'password'}
          autoFocus
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Escribe la clave"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onClose(input.trim() || null)
            }
            if (event.key === 'Escape') {
              onClose(null)
            }
          }}
        />
        <label className="secret-visibility">
          <input
            type="checkbox"
            checked={visible}
            onChange={(event) => onVisibleChange(event.target.checked)}
          />
          Mostrar clave
        </label>
        <div className="secret-dialog-actions">
          <button type="button" onClick={() => onClose(null)}>Cancelar</button>
          <button type="button" onClick={() => onClose(input.trim() || null)}>
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </section>
  )
}

type MovePageDialogProps = {
  open: boolean
  selectedPage: Page | null
  pages: Page[]
  moveBeforePageId: string
  onMoveBeforePageIdChange: (id: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export function MovePageDialog({
  open,
  selectedPage,
  pages,
  moveBeforePageId,
  onMoveBeforePageIdChange,
  onCancel,
  onConfirm,
}: MovePageDialogProps) {
  if (!open || !selectedPage) {
    return null
  }

  const moveCandidates = pages.filter((page) => page.id !== selectedPage.id)

  return (
    <section className="app-dialog-backdrop" role="presentation">
      <div className="app-dialog" role="dialog" aria-modal="true" aria-label="Mover pagina">
        <h2>Mover pagina</h2>
        <p>
          Selecciona antes de que pagina quieres mover <strong>{selectedPage.title}</strong>.
        </p>
        <label className="app-dialog-field">
          <span>Antes de la pagina</span>
          <select
            className="page-combo"
            value={moveBeforePageId}
            onChange={(event) => onMoveBeforePageIdChange(event.target.value)}
          >
            <option value="">Al final</option>
            {moveCandidates.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title}
              </option>
            ))}
          </select>
        </label>
        <div className="app-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary" onClick={onConfirm}>
            Mover
          </button>
        </div>
      </div>
    </section>
  )
}

type ImageModalProps = {
  attachment: Attachment | null
  imageUrl: string | null
  onClose: () => void
}

export function ImageModal({ attachment, imageUrl, onClose }: ImageModalProps) {
  if (!attachment || !imageUrl) {
    return null
  }

  return (
    <section className="image-modal-backdrop" role="presentation" onClick={onClose}>
      <figure className="image-modal" onClick={onClose}>
        <img src={imageUrl} alt={attachment.name ?? 'Imagen adjunta'} />
        <figcaption>
          {attachment.name ?? attachment.id} (click para cerrar)
        </figcaption>
      </figure>
    </section>
  )
}
