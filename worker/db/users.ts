import type { AuthenticatedUser } from "../../shared/contracts";

interface AppUserRow {
  id: number;
  email: string;
  created_at: string;
  last_seen_at: string;
}

export async function upsertAppUser(
  db: D1Database,
  identity: { subject: string; email: string },
  now: string,
): Promise<Omit<AuthenticatedUser, "isAdmin">> {
  const row = await db
    .prepare(
      `INSERT INTO app_users (email, access_subject, created_at, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         access_subject = excluded.access_subject,
         last_seen_at = excluded.last_seen_at
       RETURNING id, email, created_at, last_seen_at`,
    )
    .bind(identity.email, identity.subject, now, now)
    .first<AppUserRow>();

  if (!row) throw new Error("The authenticated user record could not be persisted.");
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}
