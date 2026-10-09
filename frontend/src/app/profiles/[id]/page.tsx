import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfile } from "@/lib/api/server";

export default function ProfilePage({ params }: PageProps<"/profiles/[id]">) {
  // Params are request-time data under Cache Components, so they are read inside Suspense.
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading profile…</p>}>
      {params.then(({ id }) => (
        <ProfileDetails id={id} />
      ))}
    </Suspense>
  );
}

async function ProfileDetails({ id }: { id: string }) {
  const profile = await getProfile(id);
  if (!profile) notFound();

  const created = new Date(profile.created_at).toLocaleDateString("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{profile.name}</CardTitle>
        <CardDescription>{profile.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Career goal</dt>
            <dd>{profile.career_goal}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Bio</dt>
            <dd className="whitespace-pre-line">
              {profile.bio ?? <span className="text-muted-foreground">No bio yet.</span>}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created</dt>
            <dd>
              <time dateTime={profile.created_at}>{created}</time>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
