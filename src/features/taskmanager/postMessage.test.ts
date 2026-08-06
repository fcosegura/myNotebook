import { describe, expect, it } from 'vitest'
import {
  createNotebookErrorResponse,
  createNotebookSuccessResponse,
  isAllowedTaskManagerOrigin,
  isTaskManagerCreateNotebookMessage,
  parseTaskManagerAllowedOrigins,
} from './postMessage'

describe('taskmanager postMessage helpers', () => {
  it('uses the production TaskManager origin by default', () => {
    expect(parseTaskManagerAllowedOrigins()).toEqual([
      'https://taskmanagerpwa.fcovidalsegura.workers.dev',
    ])
  })

  it('parses comma-separated configured origins', () => {
    expect(parseTaskManagerAllowedOrigins(' https://one.example,https://two.example ,, ')).toEqual([
      'https://one.example',
      'https://two.example',
    ])
  })

  it('matches only explicitly allowed origins', () => {
    const allowedOrigins = ['https://taskmanagerpwa.fcovidalsegura.workers.dev']

    expect(isAllowedTaskManagerOrigin('https://taskmanagerpwa.fcovidalsegura.workers.dev', allowedOrigins)).toBe(true)
    expect(isAllowedTaskManagerOrigin('https://evil.example', allowedOrigins)).toBe(false)
  })

  it('recognizes valid create-notebook messages', () => {
    expect(isTaskManagerCreateNotebookMessage({
      type: 'taskmanager:create-notebook',
      requestId: 'request-1',
      payload: {
        title: 'Proyecto',
      },
    })).toBe(true)
  })

  it('rejects malformed create-notebook messages', () => {
    expect(isTaskManagerCreateNotebookMessage(null)).toBe(false)
    expect(isTaskManagerCreateNotebookMessage({ type: 'other' })).toBe(false)
    expect(isTaskManagerCreateNotebookMessage({
      type: 'taskmanager:create-notebook',
      requestId: '',
      payload: { title: 'Proyecto' },
    })).toBe(false)
    expect(isTaskManagerCreateNotebookMessage({
      type: 'taskmanager:create-notebook',
      requestId: 'request-1',
      payload: { title: 123 },
    })).toBe(false)
  })

  it('builds success and error responses with the original request id', () => {
    expect(createNotebookSuccessResponse('request-1', { id: 'notebook-1', title: 'Proyecto' })).toEqual({
      type: 'mynotebook:create-notebook:result',
      requestId: 'request-1',
      ok: true,
      payload: {
        notebook: {
          id: 'notebook-1',
          title: 'Proyecto',
        },
      },
    })

    expect(createNotebookErrorResponse('request-2', 'vault-locked', 'Desbloquea MyNotebook.')).toEqual({
      type: 'mynotebook:create-notebook:result',
      requestId: 'request-2',
      ok: false,
      error: {
        code: 'vault-locked',
        message: 'Desbloquea MyNotebook.',
      },
    })
  })
})
