export class LLMApiError extends Error {
  constructor(
    public statusCode: number,
    public responseBody: string
  ) {
    super(`LLM API error: ${statusCode}`);
    this.name = 'LLMApiError';
  }
}

export class LLMParseError extends Error {
  constructor(public rawContent: string) {
    super('Failed to parse LLM JSON response');
    this.name = 'LLMParseError';
  }
}

export class LLMTimeoutError extends Error {
  constructor() {
    super('LLM API request timed out');
    this.name = 'LLMTimeoutError';
  }
}

export class InvalidCategoryError extends Error {
  constructor(public category: string) {
    super(`Invalid category: ${category}`);
    this.name = 'InvalidCategoryError';
  }
}
