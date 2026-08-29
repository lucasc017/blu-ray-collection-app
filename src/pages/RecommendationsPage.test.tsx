import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, MovieRecommendation } from "../../shared/contracts";
import { SessionContext } from "../auth/session-context";
import { RecommendationsPage } from "./RecommendationsPage";

const user: AuthenticatedUser = {
  id: 1,
  email: "friend@example.com",
  createdAt: "2026-08-28T12:00:00.000Z",
  lastSeenAt: "2026-08-28T12:00:00.000Z",
  isAdmin: false,
};

const recommendation: MovieRecommendation = {
  id: 7,
  tmdbId: 101,
  title: "Community Pick",
  overview: "A movie worth adding to the shelf.",
  releaseDate: "2020-01-01",
  releaseYear: 2020,
  posterPath: null,
  createdAt: "2026-08-28T12:00:00.000Z",
  recommendedBy: "lucas",
  supporters: ["lucas", "friend"],
  endorsementCount: 2,
  endorsedByCurrentUser: true,
};

function listResponse(items = [recommendation]) {
  return new Response(JSON.stringify({ items, page: 1, pageSize: 24, total: items.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("RecommendationsPage", () => {
  it("lists identities, searches, recommends, endorses, and changes sorting", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("/api/recommendations/search")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  mediaType: "movie",
                  tmdbId: 202,
                  title: "New Pick",
                  originalTitle: "New Pick",
                  overview: "A new recommendation.",
                  releaseDate: "2024-01-01",
                  releaseYear: 2024,
                  posterPath: null,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/recommendations" && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              recommendation: { ...recommendation, id: 8, tmdbId: 202, title: "New Pick" },
              created: true,
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/recommendations/7/endorsement" && init?.method === "PUT") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              recommendation: {
                ...recommendation,
                supporters: ["lucas"],
                endorsementCount: 1,
                endorsedByCurrentUser: false,
              },
              removed: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(listResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const browserUser = userEvent.setup();

    render(
      <SessionContext value={user}>
        <MemoryRouter>
          <RecommendationsPage />
        </MemoryRouter>
      </SessionContext>,
    );

    expect(await screen.findByRole("heading", { name: "Community Pick" })).toBeVisible();
    expect(screen.getByText("lucas, friend")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await browserUser.selectOptions(screen.getByLabelText("Sort by"), "endorsements");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("sort=endorsements"),
        expect.any(Object),
      ),
    );

    await browserUser.type(screen.getByLabelText("Movie title"), "New Pick");
    await browserUser.click(screen.getByRole("button", { name: "Search" }));
    await browserUser.click(await screen.findByRole("button", { name: "Recommend New Pick" }));
    expect(await screen.findByText("New Pick was added and endorsed.")).toBeVisible();

    await browserUser.click(await screen.findByRole("button", { name: "Withdraw endorsement" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/recommendations/7/endorsement",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("allows an administrator to confirm permanent deletion", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/admin/recommendations/7" && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(listResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const browserUser = userEvent.setup();

    render(
      <SessionContext value={{ ...user, isAdmin: true }}>
        <MemoryRouter>
          <RecommendationsPage />
        </MemoryRouter>
      </SessionContext>,
    );

    await browserUser.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Delete this recommendation?");
    await browserUser.click(screen.getByRole("button", { name: "Delete recommendation" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/recommendations/7",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(await screen.findByText(/all of its endorsements were deleted/)).toBeVisible();
  });
});
