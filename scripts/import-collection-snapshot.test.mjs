import { describe, expect, it } from "vitest";
import { accessHeadersForImport, validatedImportUrl } from "./import-collection-snapshot.mjs";

describe("collection snapshot importer Access authentication", () => {
  it.each(["http://localhost:5173", "http://127.0.0.1:8787"])(
    "does not require service credentials for %s",
    (origin) => {
      const url = validatedImportUrl(`${origin}/api/internal/collection-snapshot`);
      expect(accessHeadersForImport(url, {})).toEqual({});
    },
  );

  it("adds both service-token headers for a remote HTTPS import", () => {
    const url = validatedImportUrl(
      "https://collection.example.com/api/internal/collection-snapshot",
    );
    expect(
      accessHeadersForImport(url, {
        CF_ACCESS_CLIENT_ID: "client-id-abcdefghijklmnopqrstuvwxyz",
        CF_ACCESS_CLIENT_SECRET: "client-secret-abcdefghijklmnopqrstuvwxyz",
      }),
    ).toEqual({
      "CF-Access-Client-Id": "client-id-abcdefghijklmnopqrstuvwxyz",
      "CF-Access-Client-Secret": "client-secret-abcdefghijklmnopqrstuvwxyz",
    });
  });

  it("fails closed when either remote service credential is missing", () => {
    const url = validatedImportUrl(
      "https://collection.example.com/api/internal/collection-snapshot",
    );
    expect(() =>
      accessHeadersForImport(url, {
        CF_ACCESS_CLIENT_ID: "client-id-abcdefghijklmnopqrstuvwxyz",
      }),
    ).toThrow("Cloudflare Access service-token credentials are missing or invalid");
  });
});
