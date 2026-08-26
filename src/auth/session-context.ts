import { createContext, useContext } from "react";
import type { AuthenticatedUser } from "../../shared/contracts";

export const SessionContext = createContext<AuthenticatedUser | null>(null);

export function useSession(): AuthenticatedUser {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider.");
  return session;
}
