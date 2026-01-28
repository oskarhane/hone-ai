import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { 
  formatError, 
  isNetworkError, 
  retryWithBackoff,
  XLoopError,
  ErrorMessages
} from './errors';

describe('formatError', () => {
  test('formats error with message only', () => {
    const result = formatError('Something went wrong');
    expect(result).toBe('✗ Something went wrong');
  });
  
  test('formats error with message and details', () => {
    const result = formatError('Something went wrong', 'More details here');
    expect(result).toBe('✗ Something went wrong\n\nMore details here');
  });
});

describe('isNetworkError', () => {
  test('returns false for non-errors', () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError('string')).toBe(false);
    expect(isNetworkError(123)).toBe(false);
  });
  
  test('detects ECONNREFUSED', () => {
    const error = new Error('connect ECONNREFUSED');
    expect(isNetworkError(error)).toBe(true);
  });
  
  test('detects ETIMEDOUT', () => {
    const error = { code: 'ETIMEDOUT', message: 'timeout' };
    expect(isNetworkError(error)).toBe(true);
  });
  
  test('detects fetch failed', () => {
    const error = new Error('fetch failed');
    expect(isNetworkError(error)).toBe(true);
  });
  
  test('detects network in message', () => {
    const error = new Error('Network request failed');
    expect(isNetworkError(error)).toBe(true);
  });
  
  test('returns false for non-network errors', () => {
    const error = new Error('Validation failed');
    expect(isNetworkError(error)).toBe(false);
  });
});

describe('retryWithBackoff', () => {
  beforeEach(() => {
    // Clear any timers
    mock.restore();
  });
  
  test('succeeds on first try', async () => {
    const fn = mock(() => Promise.resolve('success'));
    const result = await retryWithBackoff(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  
  test('retries on network error and succeeds', async () => {
    let attempts = 0;
    const fn = mock(() => {
      attempts++;
      if (attempts < 2) {
        return Promise.reject(new Error('Network timeout'));
      }
      return Promise.resolve('success');
    });
    
    const result = await retryWithBackoff(fn, { 
      initialDelay: 10,
      maxDelay: 50 
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
  
  test('throws after max retries', async () => {
    const fn = mock(() => Promise.reject(new Error('Network timeout')));
    
    await expect(
      retryWithBackoff(fn, { 
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 50 
      })
    ).rejects.toThrow('Network timeout');
    
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
  
  test('does not retry non-network errors', async () => {
    const fn = mock(() => Promise.reject(new Error('Validation failed')));
    
    await expect(
      retryWithBackoff(fn, { 
        initialDelay: 10,
        maxDelay: 50 
      })
    ).rejects.toThrow('Validation failed');
    
    expect(fn).toHaveBeenCalledTimes(1); // Only initial attempt
  });
  
  test('respects custom shouldRetry predicate', async () => {
    const fn = mock(() => Promise.reject(new Error('Custom error')));
    
    const result = await retryWithBackoff(fn, { 
      maxRetries: 1,
      initialDelay: 10,
      shouldRetry: (error: unknown) => {
        return error instanceof Error && error.message === 'Custom error';
      }
    }).catch(() => 'caught');
    
    expect(result).toBe('caught');
    expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry
  });
});

describe('XLoopError', () => {
  test('creates error with message', () => {
    const error = new XLoopError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.exitCode).toBe(1);
    expect(error.name).toBe('XLoopError');
  });
  
  test('creates error with custom exit code', () => {
    const error = new XLoopError('Test error', 2);
    expect(error.exitCode).toBe(2);
  });
});

describe('ErrorMessages', () => {
  test('MISSING_API_KEY has correct format', () => {
    const { message, details } = ErrorMessages.MISSING_API_KEY;
    expect(message).toContain('ANTHROPIC_API_KEY');
    expect(details).toContain('.env');
    expect(details).toContain('https://console.anthropic.com/');
  });
  
  test('FILE_NOT_FOUND includes path', () => {
    const { message, details } = ErrorMessages.FILE_NOT_FOUND('/path/to/file.yml');
    expect(message).toContain('File not found');
    expect(details).toContain('/path/to/file.yml');
  });
  
  test('AGENT_NOT_FOUND provides install instructions for claude', () => {
    const { message, details } = ErrorMessages.AGENT_NOT_FOUND('claude');
    expect(message).toContain('claude');
    expect(details).toContain('npm install');
  });
  
  test('AGENT_NOT_FOUND provides install instructions for opencode', () => {
    const { message, details } = ErrorMessages.AGENT_NOT_FOUND('opencode');
    expect(message).toContain('opencode');
    expect(details).toContain('npm install');
  });
  
  test('GIT_NOT_INITIALIZED has init instructions', () => {
    const { message, details } = ErrorMessages.GIT_NOT_INITIALIZED;
    expect(message).toContain('Git');
    expect(details).toContain('git init');
  });
});
