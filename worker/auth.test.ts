import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AccessAuthenticationError,
  authenticateRequest,
  mayUseAdminRoutes,
  mayUseInternalRoutes,
  userIdentity,
  validateAccessConfiguration,
  verifyAccessAssertion,
} from "./auth";

const accessEnv = {
  ACCESS_TEAM_DOMAIN: "https://test-team.cloudflareaccess.com",
  ACCESS_AUD: "test-access-audience-abcdefghijklmnopqrstuvwxyz-1234567890",
};
const configuration = validateAccessConfiguration(accessEnv);
let privateKey: CryptoKey;
let resolver: JWTVerifyGetKey;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  privateKey = keys.privateKey;
  const jwk = await exportJWK(keys.publicKey);
  resolver = createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256", kid: "test-key", use: "sig" }] });
});

async function sign(claims: Record<string, unknown>, subject: string): Promise<string> {
  return new SignJWT({ type: "app", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(configuration.issuer)
    .setAudience(configuration.audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("Cloudflare Access authentication", () => {
  it("validates a signed user assertion and normalizes its email", async () => {
    const token = await sign({ email: " Approved@Example.COM " }, "google-user-subject");
    const principal = await verifyAccessAssertion(token, configuration, resolver);
    expect(principal).toEqual({
      kind: "user",
      subject: "google-user-subject",
      email: "approved@example.com",
    });
    expect(userIdentity(principal)).toEqual({
      subject: "google-user-subject",
      email: "approved@example.com",
    });
    expect(mayUseInternalRoutes(principal)).toBe(false);
  });

  it("recognizes a signed service-token principal", async () => {
    const token = await sign({ common_name: "service-client.access" }, "");
    const principal = await verifyAccessAssertion(token, configuration, resolver);
    expect(principal).toEqual({
      kind: "service",
      clientId: "service-client.access",
    });
    expect(mayUseInternalRoutes(principal)).toBe(true);
    expect(userIdentity(principal)).toBeNull();
    await expect(mayUseAdminRoutes(principal, "approved@example.com")).resolves.toBe(false);
  });

  it("authorizes only the configured administrator email", async () => {
    const principal = {
      kind: "user" as const,
      subject: "google-user-subject",
      email: "approved@example.com",
    };
    await expect(mayUseAdminRoutes(principal, " Approved@Example.COM ")).resolves.toBe(true);
    await expect(mayUseAdminRoutes(principal, "friend@example.com")).resolves.toBe(false);
    await expect(mayUseAdminRoutes(principal, "not-an-email")).resolves.toBe(false);
  });

  it("rejects assertions for another Access application", async () => {
    const token = await new SignJWT({ type: "app", email: "approved@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(configuration.issuer)
      .setAudience("another-application-audience")
      .setSubject("google-user-subject")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(verifyAccessAssertion(token, configuration, resolver)).rejects.toBeInstanceOf(
      AccessAuthenticationError,
    );
  });

  it("rejects expired assertions", async () => {
    const token = await new SignJWT({ type: "app", email: "approved@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(configuration.issuer)
      .setAudience(configuration.audience)
      .setSubject("google-user-subject")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    await expect(verifyAccessAssertion(token, configuration, resolver)).rejects.toBeInstanceOf(
      AccessAuthenticationError,
    );
  });

  it("bypasses Access only for exact loopback HTTP development requests", async () => {
    await expect(
      authenticateRequest(new Request("http://localhost/api/session"), accessEnv),
    ).resolves.toEqual({ kind: "development" });
    await expect(
      authenticateRequest(new Request("https://localhost/api/session"), accessEnv),
    ).rejects.toBeInstanceOf(AccessAuthenticationError);
    await expect(
      authenticateRequest(new Request("http://localhost.example/api/session"), accessEnv),
    ).rejects.toBeInstanceOf(AccessAuthenticationError);
  });

  it("rejects unsafe Access team domains", () => {
    expect(() =>
      validateAccessConfiguration({
        ...accessEnv,
        ACCESS_TEAM_DOMAIN: "https://cloudflareaccess.com.evil.example",
      }),
    ).toThrow(AccessAuthenticationError);
  });
});
