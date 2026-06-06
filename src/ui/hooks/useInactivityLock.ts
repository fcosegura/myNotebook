import { useEffect, useRef, type RefObject } from 'react'

type UseInactivityLockOptions = {
  unlocked: boolean
  delayMs: number
  forceSaveNoteRef: RefObject<() => Promise<void>>
  pagePersistChainRef: RefObject<Promise<void>>
  onAutoLock: () => void
}

export function useInactivityLock({
  unlocked,
  delayMs,
  forceSaveNoteRef,
  pagePersistChainRef,
  onAutoLock,
}: UseInactivityLockOptions) {
  const inactivityTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!unlocked) {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      return
    }

    const scheduleAutoLock = () => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
      }
      inactivityTimerRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            await forceSaveNoteRef.current()
            await pagePersistChainRef.current
          } catch (error) {
            console.error('Auto-lock: guardado previo fallo:', error)
          }
          onAutoLock()
        })()
      }, delayMs)
    }

    const handleActivity = () => {
      scheduleAutoLock()
    }

    scheduleAutoLock()

    window.addEventListener('pointerdown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('touchstart', handleActivity, { passive: true })
    window.addEventListener('scroll', handleActivity, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
      window.removeEventListener('scroll', handleActivity)
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
    }
  }, [delayMs, forceSaveNoteRef, onAutoLock, pagePersistChainRef, unlocked])
}
