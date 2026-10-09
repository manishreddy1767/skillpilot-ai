import type { Metadata } from "next";

import { ProfileForm } from "@/components/profile-form";

export const metadata: Metadata = { title: "Create profile" };

export default function NewProfilePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your profile</h1>
        <p className="text-sm text-muted-foreground">
          Start with the basics. Skills and learning plans come next.
        </p>
      </div>
      <ProfileForm />
    </div>
  );
}
