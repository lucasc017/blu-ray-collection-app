import { z } from "zod";
import { normalizeBluRayReleaseUrl } from "../../shared/security";
import { parseReleaseLabel } from "./normalization";
import type { ParsedRelease } from "./types";

const MAX_SNAPSHOT_PAGES = 20;
const MAX_SNAPSHOT_RELEASES = 2_000;

const snapshotSchema = z.object({
  version: z.literal(1),
  pageCount: z.number().int().min(1).max(MAX_SNAPSHOT_PAGES),
  releases: z
    .array(
      z.object({
        productId: z
          .string()
          .regex(/^[1-9]\d*$/)
          .max(20),
        title: z.string().trim().min(1).max(500),
        href: z.string().trim().min(1).max(2_048),
        categoryId: z.literal("7").optional(),
      }),
    )
    .min(1)
    .max(MAX_SNAPSHOT_RELEASES),
});

export class InvalidCollectionSnapshotError extends Error {
  constructor(message = "The collection snapshot is invalid or incomplete.") {
    super(message);
    this.name = "InvalidCollectionSnapshotError";
  }
}

export function parseCollectionSnapshot(input: unknown, collectionUrl: string): ParsedRelease[] {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) throw new InvalidCollectionSnapshotError();

  const releases = new Map<string, ParsedRelease>();
  for (const entry of parsed.data.releases) {
    const sourceUrl = normalizeBluRayReleaseUrl(entry.href, entry.productId, collectionUrl);
    if (!sourceUrl) {
      throw new InvalidCollectionSnapshotError(
        "The collection snapshot contains an invalid physical release URL.",
      );
    }

    const release = parseReleaseLabel(entry.productId, entry.title, sourceUrl);
    const duplicate = releases.get(entry.productId);
    if (duplicate && duplicate.fingerprint !== release.fingerprint) {
      throw new InvalidCollectionSnapshotError(
        "The collection snapshot contains conflicting entries for one product.",
      );
    }
    releases.set(entry.productId, release);
  }

  return [...releases.values()];
}
