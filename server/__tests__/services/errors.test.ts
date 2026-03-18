import { describe, it, expect } from 'vitest';
import {
  LLMApiError,
  LLMParseError,
  LLMTimeoutError,
  InvalidCategoryError,
} from '../../services/errors';

describe('Error Types', () => {
  it('LLMApiError carries statusCode and responseBody', () => {
    const err = new LLMApiError(429, '{"error":"rate_limit"}');
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(429);
    expect(err.responseBody).toBe('{"error":"rate_limit"}');
    expect(err.message).toBe('LLM API error: 429');
  });

  it('LLMParseError carries rawContent', () => {
    const err = new LLMParseError('not json');
    expect(err).toBeInstanceOf(Error);
    expect(err.rawContent).toBe('not json');
    expect(err.message).toBe('Failed to parse LLM JSON response');
  });

  it('LLMTimeoutError has correct message', () => {
    const err = new LLMTimeoutError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('LLM API request timed out');
  });

  it('InvalidCategoryError carries category', () => {
    const err = new InvalidCategoryError('unknown');
    expect(err).toBeInstanceOf(Error);
    expect(err.category).toBe('unknown');
    expect(err.message).toBe('Invalid category: unknown');
  });
});
