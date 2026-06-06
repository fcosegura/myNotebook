import type { UserLocal } from '../storage/db'

type LockScreenProps = {
  user: UserLocal
  pinInput: string
  pinError: string
  onAppendDigit: (digit: string) => void
  onRemoveLastDigit: () => void
  onUnlock: () => void
  onSetupPin: () => void
}

export function LockScreen({
  user,
  pinInput,
  pinError,
  onAppendDigit,
  onRemoveLastDigit,
  onUnlock,
  onSetupPin,
}: LockScreenProps) {
  return (
    <main className="app-shell lock-screen">
      <h1>Libreta local</h1>
      <p>Tu sesion se guarda solo en este navegador.</p>
      <div className="pin-entry">
        <div
          className="pin-display"
          role="status"
          aria-live="polite"
          aria-label={`${pinInput.length} digitos ingresados`}
        >
          {pinInput.length > 0 ? (
            <span className="pin-display-dots">{'\u2022'.repeat(pinInput.length)}</span>
          ) : (
            <span className="pin-display-placeholder">Toca los numeros o escribe con el teclado</span>
          )}
        </div>
        <div className="pin-keypad" role="group" aria-label="Teclado numerico">
          {(['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const).map((digit) => (
            <button key={digit} type="button" className="pin-key" onClick={() => onAppendDigit(digit)}>
              {digit}
            </button>
          ))}
          <button
            type="button"
            className="pin-key pin-key-wide"
            onClick={onRemoveLastDigit}
            aria-label="Borrar ultimo digito"
          >
            Borrar
          </button>
          <button type="button" className="pin-key" onClick={() => onAppendDigit('0')}>
            0
          </button>
        </div>
      </div>
      <button type="button" onClick={user.sessionConfig ? onUnlock : onSetupPin}>
        {user.sessionConfig ? 'Desbloquear' : 'Configurar PIN local'}
      </button>
      {pinError ? <p className="error">{pinError}</p> : null}
    </main>
  )
}
