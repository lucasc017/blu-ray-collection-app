# ADR 0001: One Worker serves the SPA and API

Status: accepted, 2026-08-15.

Use the Cloudflare Vite plugin to deploy React assets and Hono API routes as one Worker. This keeps the browser and API same-origin, removes CORS and multi-project deployment coordination, and matches the intended small public application. Separate services remain an option only if measured scale or ownership boundaries require them.
