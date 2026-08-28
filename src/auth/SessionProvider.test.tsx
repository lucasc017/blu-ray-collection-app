import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "./SessionProvider";
import { useSession } from "./session-context";

function SessionConsumer() {
  const user = useSession();
  return <p>Signed in as {user.email}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SessionProvider", () => {
  it("bootstraps the account before rendering the application", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1,
          email: "approved@example.com",
          createdAt: "2026-08-25T12:00:00.000Z",
          lastSeenAt: "2026-08-25T12:00:00.000Z",
          isAdmin: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionProvider>
        <SessionConsumer />
      </SessionProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking your sign-in");
    expect(await screen.findByText("Signed in as approved@example.com")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/session");
    expect(requestInit?.method).toBe("PUT");
    expect(new Headers(requestInit?.headers).get("X-Requested-With")).toBe("XMLHttpRequest");
  });

  it("offers a full-page sign-in retry after an expired Access session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "unauthorized", message: "Sign in.", requestId: "request-1" },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(
      <SessionProvider>
        <SessionConsumer />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/");
  });
});
