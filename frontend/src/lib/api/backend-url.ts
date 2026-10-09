// Server-only: the backend origin, shared by next.config.ts (rewrites) and Server Components.
export const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/+$/, "");
