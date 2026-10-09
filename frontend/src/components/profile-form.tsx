"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProfile } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_CODE } from "@/lib/api/errors";
import { PROFILE_LIMITS, type ProfileCreate } from "@/lib/api/types";

type Field = keyof typeof PROFILE_LIMITS;
type Values = Record<Field, string>;

const EMPTY: Values = { name: "", email: "", career_goal: "", bio: "" };

export function ProfileForm() {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: Field, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    const payload: ProfileCreate = {
      name: values.name,
      email: values.email,
      career_goal: values.career_goal,
      bio: values.bio.trim() ? values.bio : null,
    };

    try {
      const profile = await createProfile(payload);
      // Routes stay mounted after navigation, so clear the form for the next visit.
      setValues(EMPTY);
      router.push(`/profiles/${profile.id}`);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError("Something went wrong. Please try again.");
      } else if (error.code === NETWORK_ERROR_CODE || error.status >= 500) {
        setFormError("SkillPilot could not save your profile right now. Please try again shortly.");
      } else {
        const byField = error.fieldErrors();
        setFieldErrors(byField);
        if (Object.keys(byField).length === 0) setFormError(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <FormField label="Name" field="name" error={fieldErrors.name}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          maxLength={PROFILE_LIMITS.name}
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
        />
      </FormField>

      <FormField label="Email" field="email" error={fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={PROFILE_LIMITS.email}
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
      </FormField>

      <FormField
        label="Career goal"
        field="career_goal"
        hint="For example: Machine learning engineer"
        error={fieldErrors.career_goal}
      >
        <Input
          id="career_goal"
          name="career_goal"
          required
          maxLength={PROFILE_LIMITS.career_goal}
          value={values.career_goal}
          onChange={(e) => update("career_goal", e.target.value)}
          aria-invalid={Boolean(fieldErrors.career_goal)}
          aria-describedby={fieldErrors.career_goal ? "career_goal-error" : "career_goal-hint"}
        />
      </FormField>

      <FormField label="Bio (optional)" field="bio" error={fieldErrors.bio}>
        <Textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={PROFILE_LIMITS.bio}
          value={values.bio}
          onChange={(e) => update("bio", e.target.value)}
          aria-invalid={Boolean(fieldErrors.bio)}
          aria-describedby={fieldErrors.bio ? "bio-error" : undefined}
        />
      </FormField>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create profile"}
      </Button>
    </form>
  );
}

function FormField({
  label,
  field,
  hint,
  error,
  children,
}: {
  label: string;
  field: Field;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={field}>{label}</Label>
      {children}
      {hint && !error && (
        <p id={`${field}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${field}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
