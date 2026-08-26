import { useEffect, useState, type ReactNode } from "react";
import type { AuthenticatedUser } from "../../shared/contracts";
import { ApiError, sessionApi } from "../api";
import { SessionContext } from "./session-context";

type SessionState =
  | { status: "loading" }
  | { status: "ready"; user: AuthenticatedUser }
  | { status: "error"; error: Error };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void sessionApi
      .bootstrap(controller.signal)
      .then((user) => setState({ status: "ready", user }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          error: error instanceof Error ? error : new Error("The session could not be loaded."),
        });
      });
    return () => controller.abort();
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <main className="session-shell" aria-busy="true">
        <section className="state-panel" role="status">
          <p className="eyebrow">The Disc Shelf</p>
          <h1>Checking your sign-in…</h1>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    const sessionExpired = state.error instanceof ApiError && state.error.status === 401;
    return (
      <main className="session-shell">
        <section className="state-panel" role="alert">
          <p className="eyebrow">Sign-in required</p>
          <h1>{sessionExpired ? "Your session has ended." : "We could not load your account."}</h1>
          <p>
            {sessionExpired
              ? "Sign in with your approved Google account to continue."
              : "The service may be temporarily unavailable. Try again in a moment."}
          </p>
          {sessionExpired ? (
            <a className="button-link" href={`${location.pathname}${location.search}`}>
              Sign in again
            </a>
          ) : (
            <button
              type="button"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          )}
        </section>
      </main>
    );
  }

  return <SessionContext value={state.user}>{children}</SessionContext>;
}
