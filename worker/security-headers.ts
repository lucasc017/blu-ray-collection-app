const API_SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy":
    "accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export function applyApiSecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) headers.set(name, value);
}
