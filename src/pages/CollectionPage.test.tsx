import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "./CollectionPage";

function collectionResponse() {
  return new Response(
    JSON.stringify({
      items: [],
      page: 1,
      pageSize: 24,
      total: 0,
      filters: { genres: [], years: [], mediaTypes: [] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function statusResponse() {
  return new Response(
    JSON.stringify({
      titleCount: 0,
      activeReleaseCount: 0,
      unresolvedIssueCount: 0,
      state: "empty",
      lastSuccessfulSyncAt: null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function titleRequests(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchMock.mock.calls.filter(([input]) =>
    (typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    ).startsWith("/api/titles?"),
  );
}

function CollectionHarness() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void navigate("/?q=Arrival");
        }}
      >
        Load shared search
      </button>
      <output data-testid="location-search">{location.search}</output>
      <CollectionPage />
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("CollectionPage search", () => {
  it("keeps typing local and focused until one explicit search is submitted", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return Promise.resolve(url === "/api/status" ? statusResponse() : collectionResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/?page=3&type=movie"]}>
        <CollectionHarness />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "No titles found" })).toBeVisible();
    const input = screen.getByRole("searchbox", { name: "Search the shelf" });
    expect(screen.getByRole("search")).toBeVisible();
    expect(input).toHaveAttribute("enterkeyhint", "search");
    expect(titleRequests(fetchMock)).toHaveLength(1);

    await user.click(input);
    await user.type(input, "  Blade Runner  ");

    expect(input).toHaveFocus();
    expect(input).toHaveValue("  Blade Runner  ");
    expect(screen.getByTestId("location-search")).toHaveTextContent("?page=3&type=movie");
    expect(titleRequests(fetchMock)).toHaveLength(1);

    await user.keyboard("{Enter}");

    await waitFor(() => expect(titleRequests(fetchMock)).toHaveLength(2));
    expect(screen.getByTestId("location-search")).toHaveTextContent("?type=movie&q=Blade+Runner");
    expect(screen.getByTestId("location-search")).not.toHaveTextContent("page=");
    expect(screen.getByRole("searchbox", { name: "Search the shelf" })).toBe(input);
    expect(input).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(titleRequests(fetchMock)).toHaveLength(2);
  });

  it("submits an empty search and synchronizes external URL changes without remounting", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return Promise.resolve(url === "/api/status" ? statusResponse() : collectionResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/?q=Alien&type=movie"]}>
        <CollectionHarness />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "No titles found" })).toBeVisible();
    const input = screen.getByRole("searchbox", { name: "Search the shelf" });
    expect(input).toHaveValue("Alien");

    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(titleRequests(fetchMock)).toHaveLength(2));
    expect(screen.getByTestId("location-search")).toHaveTextContent("?type=movie");
    expect(screen.getByTestId("location-search")).not.toHaveTextContent("q=");
    expect(screen.getByRole("searchbox", { name: "Search the shelf" })).toBe(input);

    await user.click(screen.getByRole("button", { name: "Load shared search" }));

    await waitFor(() => expect(input).toHaveValue("Arrival"));
    expect(screen.getByRole("searchbox", { name: "Search the shelf" })).toBe(input);

    await user.click(await screen.findByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.getByTestId("location-search")).toBeEmptyDOMElement();
    expect(screen.getByRole("searchbox", { name: "Search the shelf" })).toBe(input);
  });
});
