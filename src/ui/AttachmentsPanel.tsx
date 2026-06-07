import type { Attachment } from '../storage/db'

type AttachmentsPanelProps = {
  attachments: Attachment[]
  readOnly: boolean
  onOpenAttachmentModal: (attachment: Attachment) => void
  onCopyAttachmentReference: (attachment: Attachment) => void
  onRemoveAttachment: (attachmentId: string) => void
}

export function AttachmentsPanel({
  attachments,
  readOnly,
  onOpenAttachmentModal,
  onCopyAttachmentReference,
  onRemoveAttachment,
}: AttachmentsPanelProps) {
  return (
    <section className="attachments">
      <h3>Imágenes de la página</h3>
      <div className="attachments-content">
        {attachments.length === 0 ? (
          <p className="attachments-empty">
            {readOnly
              ? 'Esta página archivada no tiene imágenes.'
              : 'Pega una captura con Ctrl/Cmd + V y aparecerá aquí como recurso visual.'}
          </p>
        ) : (
          <div className="attachment-grid">
            {attachments.map((attachment) => (
              <figure key={attachment.id}>
                <button
                  type="button"
                  className="attachment-preview-button"
                  title="Abrir imagen"
                  onClick={() => onOpenAttachmentModal(attachment)}
                >
                  <img src={URL.createObjectURL(attachment.blob)} alt={attachment.name ?? 'Adjunto pegado'} />
                </button>
                <figcaption>
                  <div className="attachment-meta">
                    <strong>{attachment.name ?? 'imagen-sin-nombre'}</strong>
                    <small>{(attachment.sizeBytes / 1024).toFixed(1)} KB</small>
                  </div>
                  <div className="attachment-actions">
                    <button type="button" onClick={() => onCopyAttachmentReference(attachment)}>
                      Copiar ref
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      title={readOnly ? 'Archivo de solo lectura' : 'Eliminar imagen'}
                      onClick={() => {
                        onRemoveAttachment(attachment.id)
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
