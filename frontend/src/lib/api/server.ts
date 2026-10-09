// Server-side API access: used by Server Components, which call the backend directly.
import { BACKEND_URL } from "./backend-url";
import { ApiError, requestJson } from "./errors";
import type { Profile, ProfileList } from "./types";

const api = (path: string) => `${BACKEND_URL}/api/v1${path}`;

export async function listProfiles(limit = 50): Promise<ProfileList> {
  return requestJson<ProfileList>(api(`/profiles?limit=${limit}`));
}

/** Returns null when the profile does not exist (or the id is malformed). */
export async function getProfile(id: string): Promise<Profile | null> {
  try {
    return await requestJson<Profile>(api(`/profiles/${encodeURIComponent(id)}`));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}
