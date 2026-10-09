import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listProfiles } from "@/lib/api/server";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
        <Link href="/profiles/new" className={buttonVariants()}>
          Create profile
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading profiles…</p>}>
        <ProfileListSection />
      </Suspense>
    </div>
  );
}

async function ProfileListSection() {
  const { items, total } = await listProfiles();

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No profiles yet</CardTitle>
          <CardDescription>
            Create your SkillPilot profile to start tracking your career goals.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((profile) => (
        <li key={profile.id}>
          <Link
            href={`/profiles/${profile.id}`}
            className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle>{profile.name}</CardTitle>
                <CardDescription>{profile.career_goal}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
