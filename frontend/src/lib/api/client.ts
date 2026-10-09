// Browser-side API access. Requests go to same-origin /api/v1/*, which next.config.ts
// rewrites to the backend, so no CORS configuration is needed.
import { requestJson } from "./errors";
import type { Profile, ProfileCreate } from "./types";

export async function createProfile(data: ProfileCreate): Promise<Profile> {
  return requestJson<Profile>("/api/v1/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
