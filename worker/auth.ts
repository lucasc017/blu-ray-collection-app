import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type FetchImplementation,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { z } from "zod";

const ACCESS_ASSERTION_HEADER = "Cf-Access-Jwt-Assertion";
const ACCESS_CERTS_PATH = "/cdn-cgi/access/certs";
const ACCESS_JWKS_TIMEOUT_MS = 5_000;
const MAX_ACCESS_ASSERTION_LENGTH = 16 * 1024;
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

interface AccessConfigurationInput {
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
}

interface AccessClaims extends JWTPayload {
  common_name?: unknown;
  email?: unknown;
  type?: unknown;
}

export type AccessPrincipal =
  | { kind: "user"; subject: string; email: string }
  | { kind: "service"; clientId: string }
  | { kind: "development" };

export class AccessAuthenticationError extends Error {
  constructor() {
    super("The request does not contain a valid Cloudflare Access identity.");
    this.name = "AccessAuthenticationError";
  }
}

export interface AccessConfiguration {
  audience: string;
  issuer: string;
  jwksUrl: URL;
}

function invalidConfiguration(): never {
  throw new AccessAuthenticationError();
}

export function validateAccessConfiguration(input: AccessConfigurationInput): AccessConfiguration {
  let teamUrl: URL;
  try {
    teamUrl = new URL(input.ACCESS_TEAM_DOMAIN);
  } catch {
    return invalidConfiguration();
  }

  if (
    teamUrl.protocol !== "https:" ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(teamUrl.hostname) ||
    teamUrl.port !== "" ||
    teamUrl.username !== "" ||
    teamUrl.password !== "" ||
    (teamUrl.pathname !== "/" && teamUrl.pathname !== "") ||
    teamUrl.search !== "" ||
    teamUrl.hash !== "" ||
    !/^[A-Za-z0-9_-]{16,256}$/.test(input.ACCESS_AUD)
  ) {
    return invalidConfiguration();
  }

  const issuer = teamUrl.origin;
  return {
    audience: input.ACCESS_AUD,
    issuer,
    jwksUrl: new URL(ACCESS_CERTS_PATH, issuer),
  };
}

function isLoopbackDevelopmentRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

const cachedJwksFetch: FetchImplementation = async (url, options) => {
  const cache = caches.default;
  const cacheKey = new Request(url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await fetch(url, options);
  if (response.ok) {
    try {
      await cache.put(cacheKey, response.clone());
    } catch {
      // A cache write is an optimization; the verified response remains usable for this request.
    }
  }
  return response;
};

function principalFromClaims(claims: AccessClaims): AccessPrincipal {
  if (claims.type !== "app") throw new AccessAuthenticationError();

  if (typeof claims.sub === "string" && claims.sub.length > 0) {
    if (claims.sub.length > 512) throw new AccessAuthenticationError();
    const email = emailSchema.safeParse(claims.email);
    if (!email.success) throw new AccessAuthenticationError();
    return { kind: "user", subject: claims.sub, email: email.data };
  }

  if (
    claims.sub === "" &&
    typeof claims.common_name === "string" &&
    claims.common_name.length > 0 &&
    claims.common_name.length <= 512
  ) {
    return { kind: "service", clientId: claims.common_name };
  }

  throw new AccessAuthenticationError();
}

export async function verifyAccessAssertion(
  token: string,
  configuration: AccessConfiguration,
  keyResolver?: JWTVerifyGetKey,
): Promise<AccessPrincipal> {
  try {
    const resolver =
      keyResolver ??
      createRemoteJWKSet(configuration.jwksUrl, {
        timeoutDuration: ACCESS_JWKS_TIMEOUT_MS,
        [customFetch]: cachedJwksFetch,
      });
    const { payload } = await jwtVerify<AccessClaims>(token, resolver, {
      algorithms: ["RS256"],
      audience: configuration.audience,
      issuer: configuration.issuer,
    });
    return principalFromClaims(payload);
  } catch (error) {
    if (error instanceof AccessAuthenticationError) throw error;
    throw new AccessAuthenticationError();
  }
}

export async function authenticateRequest(
  request: Request,
  env: AccessConfigurationInput,
  keyResolver?: JWTVerifyGetKey,
): Promise<AccessPrincipal> {
  if (isLoopbackDevelopmentRequest(request)) return { kind: "development" };

  const token = request.headers.get(ACCESS_ASSERTION_HEADER);
  if (!token || token.length > MAX_ACCESS_ASSERTION_LENGTH) throw new AccessAuthenticationError();
  return verifyAccessAssertion(token, validateAccessConfiguration(env), keyResolver);
}

export function userIdentity(
  principal: AccessPrincipal,
): { subject: string; email: string } | null {
  if (principal.kind === "user") {
    return { subject: principal.subject, email: principal.email };
  }
  if (principal.kind === "development") {
    return { subject: "local-development", email: "developer@localhost.invalid" };
  }
  return null;
}

export function mayUseInternalRoutes(principal: AccessPrincipal): boolean {
  return principal.kind === "service" || principal.kind === "development";
}

export async function mayUseAdminRoutes(
  principal: AccessPrincipal,
  configuredAdminEmail: string | undefined,
): Promise<boolean> {
  const identity = userIdentity(principal);
  const adminEmail = emailSchema.safeParse(configuredAdminEmail);
  if (!identity || !adminEmail.success) return false;

  const encoder = new TextEncoder();
  const [identityDigest, adminDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(identity.email)),
    crypto.subtle.digest("SHA-256", encoder.encode(adminEmail.data)),
  ]);
  return crypto.subtle.timingSafeEqual(identityDigest, adminDigest);
}
