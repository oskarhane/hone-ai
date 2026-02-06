import { describe, expect, test, beforeEach, mock } from 'bun:test'
import {
  formatError,
  isNetworkError,
  isRateLimitError,
  isModelUnavailableError,
  parseAgentError,
  retryWithBackoff,
  HoneError,
  ErrorMessages,
} from './errors'

describe('formatError', () => {
  test('formats error with message only', () => {
    const result = formatError('Something went wrong')
    expect(result).toBe('✗ Something went wrong')
  })

  test('formats error with message and details', () => {
    const result = formatError('Something went wrong', 'More details here')
    expect(result).toBe('✗ Something went wrong\n\nMore details here')
  })
})

describe('isNetworkError', () => {
  test('returns false for non-errors', () => {
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError(undefined)).toBe(false)
    expect(isNetworkError('string')).toBe(false)
    expect(isNetworkError(123)).toBe(false)
  })

  test('detects ECONNREFUSED', () => {
    const error = new Error('connect ECONNREFUSED')
    expect(isNetworkError(error)).toBe(true)
  })

  test('detects ETIMEDOUT', () => {
    const error = { code: 'ETIMEDOUT', message: 'timeout' }
    expect(isNetworkError(error)).toBe(true)
  })

  test('detects fetch failed', () => {
    const error = new Error('fetch failed')
    expect(isNetworkError(error)).toBe(true)
  })

  test('detects network in message', () => {
    const error = new Error('Network request failed')
    expect(isNetworkError(error)).toBe(true)
  })

  test('returns false for non-network errors', () => {
    const error = new Error('Validation failed')
    expect(isNetworkError(error)).toBe(false)
  })
})

describe('retryWithBackoff', () => {
  beforeEach(() => {
    // Clear any timers
    mock.restore()
  })

  test('succeeds on first try', async () => {
    const fn = mock(() => Promise.resolve('success'))
    const result = await retryWithBackoff(fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('retries on network error and succeeds', async () => {
    let attempts = 0
    const fn = mock(() => {
      attempts++
      if (attempts < 2) {
        return Promise.reject(new Error('Network timeout'))
      }
      return Promise.resolve('success')
    })

    const result = await retryWithBackoff(fn, {
      initialDelay: 10,
      maxDelay: 50,
    })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('throws after max retries', async () => {
    const fn = mock(() => Promise.reject(new Error('Network timeout')))

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 50,
      })
    ).rejects.toThrow('Network timeout')

    expect(fn).toHaveBeenCalledTimes(3) // Initial + 2 retries
  })

  test('does not retry non-network errors', async () => {
    const fn = mock(() => Promise.reject(new Error('Validation failed')))

    await expect(
      retryWithBackoff(fn, {
        initialDelay: 10,
        maxDelay: 50,
      })
    ).rejects.toThrow('Validation failed')

    expect(fn).toHaveBeenCalledTimes(1) // Only initial attempt
  })

  test('respects custom shouldRetry predicate', async () => {
    const fn = mock(() => Promise.reject(new Error('Custom error')))

    const result = await retryWithBackoff(fn, {
      maxRetries: 1,
      initialDelay: 10,
      shouldRetry: (error: unknown) => {
        return error instanceof Error && error.message === 'Custom error'
      },
    }).catch(() => 'caught')

    expect(result).toBe('caught')
    expect(fn).toHaveBeenCalledTimes(2) // Initial + 1 retry
  })
})

describe('HoneError', () => {
  test('creates error with message', () => {
    const error = new HoneError('Test error')
    expect(error.message).toBe('Test error')
    expect(error.exitCode).toBe(1)
    expect(error.name).toBe('HoneError')
  })

  test('creates error with custom exit code', () => {
    const error = new HoneError('Test error', 2)
    expect(error.exitCode).toBe(2)
  })
})

describe('isRateLimitError', () => {
  test('detects rate limit variations', () => {
    expect(isRateLimitError('Rate limit exceeded')).toBe(true)
    expect(isRateLimitError('rate_limit error')).toBe(true)
    expect(isRateLimitError('429 Too Many Requests')).toBe(true)
    expect(isRateLimitError('Quota exceeded')).toBe(true)
  })

  test('returns false for non-rate-limit errors', () => {
    expect(isRateLimitError('Model not found')).toBe(false)
    expect(isRateLimitError('Network error')).toBe(false)
  })
})

describe('isModelUnavailableError', () => {
  test('detects model unavailability', () => {
    expect(isModelUnavailableError('Model not found')).toBe(true)
    expect(isModelUnavailableError('Invalid model name')).toBe(true)
    expect(isModelUnavailableError('404 Not Found')).toBe(true)
    expect(isModelUnavailableError('Unknown model')).toBe(true)
  })

  test('returns false for non-model errors', () => {
    expect(isModelUnavailableError('Rate limit exceeded')).toBe(false)
    expect(isModelUnavailableError('Network timeout')).toBe(false)
  })
})

describe('parseAgentError', () => {
  test('identifies network errors', () => {
    const result = parseAgentError('ECONNREFUSED', 1)
    expect(result.type).toBe('network')
    expect(result.retryable).toBe(true)
  })

  test('identifies rate limit errors', () => {
    const result = parseAgentError('Rate limit exceeded', 1)
    expect(result.type).toBe('rate_limit')
    expect(result.retryable).toBe(false)
  })

  test('extracts retry-after from rate limit errors', () => {
    const result = parseAgentError('Rate limit exceeded. Retry after 60 seconds', 1)
    expect(result.type).toBe('rate_limit')
    expect(result.retryAfter).toBe(60)
  })

  test('identifies model unavailable errors', () => {
    const result = parseAgentError('Model not found', 1)
    expect(result.type).toBe('model_unavailable')
    expect(result.retryable).toBe(false)
  })

  test('identifies spawn failures', () => {
    const result = parseAgentError('ENOENT', 1)
    expect(result.type).toBe('spawn_failed')
    expect(result.retryable).toBe(false)
  })

  test('returns unknown for other errors', () => {
    const result = parseAgentError('Some random error', 1)
    expect(result.type).toBe('unknown')
    expect(result.retryable).toBe(false)
  })
})

describe('ErrorMessages', () => {
  test('MISSING_API_KEY has correct format', () => {
    const { message, details } = ErrorMessages.MISSING_API_KEY
    expect(message).toBe('Missing API key')
    expect(details).toContain('ANTHROPIC_API_KEY')
    expect(details).toContain('.env')
    expect(details).toContain('https://console.anthropic.com/')
  })

  test('FILE_NOT_FOUND includes path', () => {
    const { message, details } = ErrorMessages.FILE_NOT_FOUND('/path/to/file.yml')
    expect(message).toContain('File not found')
    expect(details).toContain('/path/to/file.yml')
  })

  test('AGENT_NOT_FOUND provides install instructions for claude', () => {
    const { message, details } = ErrorMessages.AGENT_NOT_FOUND('claude')
    expect(message).toContain('claude')
    expect(details).toContain('npm install')
  })

  test('AGENT_NOT_FOUND provides install instructions for opencode', () => {
    const { message, details } = ErrorMessages.AGENT_NOT_FOUND('opencode')
    expect(message).toContain('opencode')
    expect(details).toContain('npm install')
  })

  test('GIT_NOT_INITIALIZED has init instructions', () => {
    const { message, details } = ErrorMessages.GIT_NOT_INITIALIZED
    expect(message).toContain('Git')
    expect(details).toContain('git init')
  })

  test('AGENT_SPAWN_FAILED includes agent and error', () => {
    const { message, details } = ErrorMessages.AGENT_SPAWN_FAILED('opencode', 'command not found')
    expect(message).toContain('opencode')
    expect(details).toContain('command not found')
    expect(details).toContain('PATH')
  })

  test('MODEL_UNAVAILABLE includes model and agent', () => {
    const { message, details } = ErrorMessages.MODEL_UNAVAILABLE(
      'claude-sonnet-4-invalid',
      'opencode'
    )
    expect(message).toBe('Model claude-sonnet-4-invalid unavailable')
    expect(details).toContain('claude-sonnet-4-invalid')
    expect(details).toContain('opencode')
    expect(details).toContain('--help')
  })

  test('RATE_LIMIT_ERROR without retry-after', () => {
    const { message, details } = ErrorMessages.RATE_LIMIT_ERROR('opencode')
    expect(message).toContain('Rate limit')
    expect(details).toContain('opencode')
    expect(details).toContain('wait')
  })

  test('RATE_LIMIT_ERROR with retry-after', () => {
    const { message, details } = ErrorMessages.RATE_LIMIT_ERROR('claude', 120)
    expect(message).toContain('Rate limit')
    expect(details).toContain('120 seconds')
  })

  test('AGENT_ERROR includes details', () => {
    const { message, details } = ErrorMessages.AGENT_ERROR('opencode', 2, 'Invalid input')
    expect(message).toContain('opencode')
    expect(details).toContain('Exit code: 2')
    expect(details).toContain('Invalid input')
  })
})
