export class FetchBudgetExceededError extends Error {
  constructor() {
    super("The external fetch budget for this invocation has been exhausted.");
    this.name = "FetchBudgetExceededError";
  }
}

export class ExternalFetchError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly retryable = true,
  ) {
    super(message);
    this.name = "ExternalFetchError";
  }
}

export class FetchBudget {
  used = 0;

  constructor(readonly maximum: number) {}

  get remaining(): number {
    return this.maximum - this.used;
  }

  async fetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
    timeoutMs = 10_000,
  ): Promise<Response> {
    if (this.used >= this.maximum) throw new FetchBudgetExceededError();
    this.used += 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("External request timed out"), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      throw new ExternalFetchError(
        error instanceof Error
          ? `External request failed: ${error.message}`
          : "External request failed.",
        null,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
