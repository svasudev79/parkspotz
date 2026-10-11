import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { redirectIfLoggedIn } from "@/lib/session";

export const metadata: Metadata = { title: "Sign up · ParkSpotZ" };

export default async function SignupPage() {
  await redirectIfLoggedIn();
  return <AuthForm mode="signup" />;
}
