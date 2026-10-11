import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { redirectIfLoggedIn } from "@/lib/session";
import { safeNextPath } from "@/lib/types";

export const metadata: Metadata = { title: "Sign up · ParkSpotZ" };

export default async function SignupPage(props: PageProps<"/signup">) {
  // ?next=/some/page sends the visitor there after logging in.
  const next = safeNextPath((await props.searchParams).next);
  await redirectIfLoggedIn(next);
  return <AuthForm mode="signup" next={next} />;
}
