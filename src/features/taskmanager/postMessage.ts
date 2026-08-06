const DEFAULT_TASKMANAGER_ALLOWED_ORIGINS = [
  'https://taskmanagerpwa.fcovidalsegura.workers.dev',
] as const

export const TASKMANAGER_CREATE_NOTEBOOK_MESSAGE_TYPE = 'taskmanager:create-notebook'
export const MYNOTEBOOK_CREATE_NOTEBOOK_RESULT_MESSAGE_TYPE = 'mynotebook:create-notebook:result'

type UnknownRecord = Record<string, unknown>

export type TaskManagerCreateNotebookMessage = {
  type: typeof TASKMANAGER_CREATE_NOTEBOOK_MESSAGE_TYPE
  requestId: string
  payload: {
    title: string
  }
}

export type MyNotebookCreateNotebookResultMessage = {
  type: typeof MYNOTEBOOK_CREATE_NOTEBOOK_RESULT_MESSAGE_TYPE
  requestId: string
} & (
  | {
    ok: true
    payload: {
      notebook: {
        id: string
        title: string
      }
    }
  }
  | {
    ok: false
    error: {
      code: 'invalid-message' | 'invalid-title' | 'vault-locked' | 'create-failed'
      message: string
    }
  }
)

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

export function parseTaskManagerAllowedOrigins(rawOrigins?: string): string[] {
  const configuredOrigins = rawOrigins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []

  return configuredOrigins.length > 0
    ? configuredOrigins
    : [...DEFAULT_TASKMANAGER_ALLOWED_ORIGINS]
}

export function isAllowedTaskManagerOrigin(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes(origin)
}

export function isTaskManagerCreateNotebookMessage(
  data: unknown,
): data is TaskManagerCreateNotebookMessage {
  if (!isRecord(data)) {
    return false
  }

  if (data.type !== TASKMANAGER_CREATE_NOTEBOOK_MESSAGE_TYPE) {
    return false
  }

  if (typeof data.requestId !== 'string' || data.requestId.trim().length === 0) {
    return false
  }

  if (!isRecord(data.payload)) {
    return false
  }

  return typeof data.payload.title === 'string'
}

export function createNotebookSuccessResponse(
  requestId: string,
  notebook: { id: string; title: string },
): MyNotebookCreateNotebookResultMessage {
  return {
    type: MYNOTEBOOK_CREATE_NOTEBOOK_RESULT_MESSAGE_TYPE,
    requestId,
    ok: true,
    payload: {
      notebook,
    },
  }
}

export function createNotebookErrorResponse(
  requestId: string,
  code: 'invalid-message' | 'invalid-title' | 'vault-locked' | 'create-failed',
  message: string,
): MyNotebookCreateNotebookResultMessage {
  return {
    type: MYNOTEBOOK_CREATE_NOTEBOOK_RESULT_MESSAGE_TYPE,
    requestId,
    ok: false,
    error: {
      code,
      message,
    },
  }
}
