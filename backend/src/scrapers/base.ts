export class ScraperError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly statusCode?: number
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ScraperError";
  }
}

export class ScraperNotConfiguredError extends ScraperError {
  constructor(provider: string) {
    super(provider, `${provider} API key is not configured`);
    this.name = "ScraperNotConfiguredError";
  }
}

// Exponential backoff retry for rate-limited scraper calls
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof ScraperError && err.statusCode === 429 && attempt < maxAttempts - 1) {
        await new Promise((res) => setTimeout(res, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
