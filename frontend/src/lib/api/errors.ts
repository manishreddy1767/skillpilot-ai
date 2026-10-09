import type { ApiErrorBody, ApiErrorDetail } from "./types";

/** An error response from the SkillPilot API, or a failure to reach it. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Messages keyed by field name, for showing next to form inputs. */
  fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const detail of this.details) {
      if (detail.field && !errors[detail.field]) errors[detail.field] = detail.message;
    }
    return errors;
  }
}

export const NETWORK_ERROR_CODE = "network_error";

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

/** Fetch JSON from the API, turning every failure mode into an ApiError. */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR_CODE, "Could not reach the SkillPilot API.");
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorBody(body)) {
      const { code, message, details } = body.error;
      throw new ApiError(response.status, code, message, details ?? []);
    }
    throw new ApiError(
      response.status,
      "unexpected_response",
      `The API responded with status ${response.status}.`,
    );
  }
  return body as T;
}
