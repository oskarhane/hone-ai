import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { setVerbose, getVerbose, logVerbose, logVerboseError, log, logError } from './logger';

// Mock console functions
const originalLog = console.log;
const originalError = console.error;
let logCalls: string[] = [];
let errorCalls: string[] = [];

beforeEach(() => {
  // Reset verbose mode to false before each test
  setVerbose(false);
  
  // Reset call tracking
  logCalls = [];
  errorCalls = [];
  
  // Mock console functions
  console.log = mock((message: string) => {
    logCalls.push(message);
  });
  
  console.error = mock((message: string) => {
    errorCalls.push(message);
  });
});

// Restore console functions after all tests
process.on('exit', () => {
  console.log = originalLog;
  console.error = originalError;
});

describe('logger', () => {
  test('setVerbose and getVerbose work correctly', () => {
    expect(getVerbose()).toBe(false);
    
    setVerbose(true);
    expect(getVerbose()).toBe(true);
    
    setVerbose(false);
    expect(getVerbose()).toBe(false);
  });
  
  test('logVerbose only logs when verbose mode is enabled', () => {
    // Should not log when verbose is false
    setVerbose(false);
    logVerbose('test message');
    expect(logCalls).toEqual([]);
    
    // Should log when verbose is true
    setVerbose(true);
    logVerbose('verbose message');
    expect(logCalls).toEqual(['verbose message']);
  });
  
  test('logVerboseError only logs when verbose mode is enabled', () => {
    // Should not log when verbose is false
    setVerbose(false);
    logVerboseError('test error');
    expect(errorCalls).toEqual([]);
    
    // Should log when verbose is true
    setVerbose(true);
    logVerboseError('verbose error');
    expect(errorCalls).toEqual(['verbose error']);
  });
  
  test('log always logs regardless of verbose mode', () => {
    // Should log when verbose is false
    setVerbose(false);
    log('always log');
    expect(logCalls).toEqual(['always log']);
    
    // Reset and test with verbose true
    logCalls = [];
    setVerbose(true);
    log('always log verbose');
    expect(logCalls).toEqual(['always log verbose']);
  });
  
  test('logError always logs regardless of verbose mode', () => {
    // Should log when verbose is false
    setVerbose(false);
    logError('always error');
    expect(errorCalls).toEqual(['always error']);
    
    // Reset and test with verbose true
    errorCalls = [];
    setVerbose(true);
    logError('always error verbose');
    expect(errorCalls).toEqual(['always error verbose']);
  });
});