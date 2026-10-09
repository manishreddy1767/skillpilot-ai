import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProfileNotFound() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile not found</CardTitle>
        <CardDescription>This profile does not exist or may have been removed.</CardDescription>
      </CardHeader>
      <CardFooter>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Back to profiles
        </Link>
      </CardFooter>
    </Card>
  );
}
