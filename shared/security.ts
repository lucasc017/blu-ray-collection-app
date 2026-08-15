const BLU_RAY_HOSTS = new Set(["blu-ray.com", "www.blu-ray.com"]);

export function normalizeBluRayReleaseUrl(
  value: string,
  productId: string,
  baseUrl = "https://www.blu-ray.com/",
): string | null {
  if (!/^[1-9]\d*$/.test(productId)) return null;

  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const expectedSuffix = `/${productId}/`;
  if (
    url.protocol !== "https:" ||
    !BLU_RAY_HOSTS.has(hostname) ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !url.pathname.startsWith("/movies/") ||
    !url.pathname.endsWith(expectedSuffix)
  ) {
    return null;
  }

  url.hostname = hostname;
  url.search = "";
  url.hash = "";
  return url.toString();
}
