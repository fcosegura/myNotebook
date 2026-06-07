import { useRef, useState } from 'react'
import type { AlertDialogConfig, AppDialogState, ConfirmDialogConfig, TextDialogConfig } from '../AppDialogs'

export function useAppDialogs() {
  const [secretDialog, setSecretDialog] = useState<{ title: string; confirmLabel: string } | null>(null)
  const [secretInput, setSecretInput] = useState('')
  const [secretVisible, setSecretVisible] = useState(false)
  const [appDialog, setAppDialog] = useState<AppDialogState | null>(null)
  const [appDialogInput, setAppDialogInput] = useState('')
  const [movePageDialogOpen, setMovePageDialogOpen] = useState(false)
  const [moveBeforePageId, setMoveBeforePageId] = useState<string>('')
  const secretResolverRef = useRef<((value: string | null) => void) | null>(null)
  const appDialogResolverRef = useRef<((value: unknown) => void) | null>(null)

  function openMovePageDialog() {
    setMoveBeforePageId('')
    setMovePageDialogOpen(true)
  }

  function closeMovePageDialog() {
    setMovePageDialogOpen(false)
    setMoveBeforePageId('')
  }

  function requestSecret(title: string, confirmLabel: string): Promise<string | null> {
    setSecretInput('')
    setSecretVisible(false)
    setSecretDialog({ title, confirmLabel })
    return new Promise((resolve) => {
      secretResolverRef.current = resolve
    })
  }

  function closeSecretDialog(value: string | null) {
    setSecretDialog(null)
    setSecretVisible(false)
    const resolver = secretResolverRef.current
    secretResolverRef.current = null
    resolver?.(value)
  }

  function requestTextDialog(config: TextDialogConfig): Promise<string | null> {
    setAppDialogInput(config.initialValue ?? '')
    setAppDialog({ ...config, kind: 'text' })
    return new Promise((resolve) => {
      appDialogResolverRef.current = resolve as (value: unknown) => void
    })
  }

  function requestConfirmDialog(config: ConfirmDialogConfig): Promise<boolean> {
    setAppDialogInput('')
    setAppDialog({ ...config, kind: 'confirm' })
    return new Promise((resolve) => {
      appDialogResolverRef.current = resolve as (value: unknown) => void
    })
  }

  async function requestAlertDialog(config: AlertDialogConfig): Promise<void> {
    setAppDialogInput('')
    setAppDialog({ ...config, kind: 'alert' })
    await new Promise<void>((resolve) => {
      appDialogResolverRef.current = () => resolve()
    })
  }

  function closeAppDialog(value: string | boolean | null) {
    setAppDialog(null)
    setAppDialogInput('')
    const resolver = appDialogResolverRef.current
    appDialogResolverRef.current = null
    resolver?.(value)
  }

  return {
    secretDialog,
    secretInput,
    secretVisible,
    appDialog,
    appDialogInput,
    movePageDialogOpen,
    moveBeforePageId,
    setSecretInput,
    setSecretVisible,
    setAppDialogInput,
    setMoveBeforePageId,
    openMovePageDialog,
    closeMovePageDialog,
    requestSecret,
    closeSecretDialog,
    requestTextDialog,
    requestConfirmDialog,
    requestAlertDialog,
    closeAppDialog,
  }
}
