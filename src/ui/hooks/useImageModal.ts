import { useEffect, useMemo, useState } from 'react'
import type { Attachment } from '../../storage/db'

export function useImageModal() {
  const [imageModalAttachment, setImageModalAttachment] = useState<Attachment | null>(null)
  const imageModalUrl = useMemo(() => {
    if (!imageModalAttachment) {
      return null
    }
    return URL.createObjectURL(imageModalAttachment.blob)
  }, [imageModalAttachment])

  useEffect(() => {
    if (!imageModalUrl) {
      return
    }
    return () => {
      URL.revokeObjectURL(imageModalUrl)
    }
  }, [imageModalUrl])

  function openAttachmentModal(attachment: Attachment) {
    setImageModalAttachment(attachment)
  }

  function closeAttachmentModal() {
    setImageModalAttachment(null)
  }

  return {
    imageModalAttachment,
    imageModalUrl,
    openAttachmentModal,
    closeAttachmentModal,
  }
}
