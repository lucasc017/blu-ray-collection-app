import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetadataReviewPage } from "./MetadataReviewPage";

const reviewList = {
  items: [
    {
      productId: "271695",
      sourceTitle: "A Conflicted Release",
      releaseYear: 2020,
      sourceUrl: "https://www.blu-ray.com/movies/A-Conflicted-Release-Blu-ray/271695/",
      format: "4K UHD",
      issue: {
        id: 7,
        code: "ambiguous_match",
        message: "Choose the correct title.",
        details: null,
        createdAt: "2026-08-27T12:00:00.000Z",
      },
      activeRevision: null,
      revisions: [],
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe("MetadataReviewPage", () => {
  it("searches TMDB, confirms a selection, and saves the conflict", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("/api/admin/tmdb/search")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  mediaType: "movie",
                  tmdbId: 101,
                  title: "Matched Movie",
                  originalTitle: "Matched Movie",
                  overview: "The selected match.",
                  releaseDate: "2020-01-01",
                  releaseYear: 2020,
                  posterPath: null,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/admin/reviews/271695" && init?.method === "PUT") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              productId: "271695",
              revision: 1,
              resolvedAt: "2026-08-27T12:05:00.000Z",
              targets: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(reviewList), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MetadataReviewPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "A Conflicted Release" })).toBeVisible();
    const searchInput = screen.getByLabelText("Title");
    expect(screen.getByRole("search")).toBeVisible();
    expect(searchInput).toHaveAttribute("enterkeyhint", "search");
    await user.type(searchInput, "Matched Movie");
    expect(searchInput).toHaveFocus();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        (typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
        ).startsWith("/api/admin/tmdb/search"),
      ),
    ).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          (typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
          ).startsWith("/api/admin/tmdb/search"),
        ),
      ).toHaveLength(1),
    );
    await user.click(await screen.findByRole("button", { name: /Matched Movie/ }));
    expect(screen.getByText("1/20 titles")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Resolve conflict" }));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Save this mapping?");
    await user.click(screen.getByRole("button", { name: "Confirm mapping" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/reviews/271695",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const saveCall = fetchMock.mock.calls.find(([input]) => input === "/api/admin/reviews/271695");
    const rawBody = saveCall?.[1]?.body;
    if (typeof rawBody !== "string") throw new Error("The review request body was not JSON.");
    const body = JSON.parse(rawBody) as unknown;
    expect(body).toEqual({
      expected: { issueId: 7, revision: null },
      targets: [{ mediaType: "movie", tmdbId: 101 }],
    });
    expect(await screen.findByText(/Saved revision 1/)).toBeVisible();
  });
});
