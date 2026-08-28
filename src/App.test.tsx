import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../shared/contracts";
import { App } from "./App";
import { SessionContext } from "./auth/session-context";

const baseUser: AuthenticatedUser = {
  id: 1,
  email: "friend@example.com",
  createdAt: "2026-08-27T12:00:00.000Z",
  lastSeenAt: "2026-08-27T12:00:00.000Z",
  isAdmin: false,
};

afterEach(() => vi.unstubAllGlobals());

describe("admin route authorization", () => {
  it("does not render or link the review screen for an ordinary signed-in user", () => {
    render(
      <SessionContext value={baseUser}>
        <MemoryRouter initialEntries={["/admin/review"]}>
          <App />
        </MemoryRouter>
      </SessionContext>,
    );
    expect(screen.getByRole("heading", { name: "That case is not on this shelf." })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Metadata review" })).not.toBeInTheDocument();
  });

  it("renders and links the review screen for the administrator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(
      <SessionContext value={{ ...baseUser, email: "admin@example.com", isAdmin: true }}>
        <MemoryRouter initialEntries={["/admin/review"]}>
          <App />
        </MemoryRouter>
      </SessionContext>,
    );
    expect(screen.getByRole("link", { name: "Metadata review" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "No conflicts need review." })).toBeVisible();
  });
});
