import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { redirectIfLoggedIn } from "@/lib/session";

export const metadata: Metadata = { title: "Log in · ParkSpotZ" };

export default async function LoginPage() {
  await redirectIfLoggedIn();
  return <AuthForm mode="login" />;
}
