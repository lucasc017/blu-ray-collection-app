import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { upsertAppUser } from "./users";

describe("app user repository", () => {
  it("keeps the application ID and creation time when an Access subject changes", async () => {
    const first = await upsertAppUser(
      env.DB,
      { email: "approved@example.com", subject: "first-access-subject" },
      "2026-08-25T12:00:00.000Z",
    );
    const refreshed = await upsertAppUser(
      env.DB,
      { email: "approved@example.com", subject: "current-access-subject" },
      "2026-08-26T12:00:00.000Z",
    );

    expect(refreshed).toEqual({
      ...first,
      lastSeenAt: "2026-08-26T12:00:00.000Z",
    });
    await expect(
      env.DB.prepare("SELECT access_subject FROM app_users WHERE id = ?")
        .bind(first.id)
        .first<string>("access_subject"),
    ).resolves.toBe("current-access-subject");
  });
});
