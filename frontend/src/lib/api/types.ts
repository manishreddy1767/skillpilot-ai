// Mirrors backend/app/modules/profile/schemas.py. Hand-written for Phase 1;
// generate from the OpenAPI schema once there are more endpoints.

export type Profile = {
  id: string;
  name: string;
  email: string;
  career_goal: string;
  bio: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileCreate = {
  name: string;
  email: string;
  career_goal: string;
  bio?: string | null;
};

export type ProfileList = {
  items: Profile[];
  total: number;
  limit: number;
  offset: number;
};

export type ApiErrorDetail = {
  field?: string;
  message: string;
  type?: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details: ApiErrorDetail[];
  };
};

// Field limits enforced by the backend; mirrored here for immediate feedback only.
export const PROFILE_LIMITS = {
  name: 100,
  email: 254,
  career_goal: 200,
  bio: 2000,
} as const;
