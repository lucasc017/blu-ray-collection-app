import { describe, expect, it } from "vitest";
import { ExternalFetchError, FetchBudget, FetchBudgetExceededError } from "./fetch-budget";

describe("external fetch safety", () => {
  it("stops before issuing a request beyond the configured budget", async () => {
    const budget = new FetchBudget(0);
    await expect(budget.fetch("https://example.com")).rejects.toBeInstanceOf(
      FetchBudgetExceededError,
    );
    expect(budget.used).toBe(0);
  });

  it("distinguishes structural and transient provider failures", () => {
    expect(new ExternalFetchError("invalid token", 401, false).retryable).toBe(false);
    expect(new ExternalFetchError("rate limited", 429, true).retryable).toBe(true);
  });

  it("counts browser navigations without issuing a fetch", () => {
    const budget = new FetchBudget(1);
    budget.consume();
    expect(budget.used).toBe(1);
    expect(() => budget.consume()).toThrow(FetchBudgetExceededError);
  });
});
