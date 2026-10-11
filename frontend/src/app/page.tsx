import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SearchPageContent } from "@/components/SearchPageContent";
import { getCurrentUser } from "@/lib/session";
import { homeFor } from "@/lib/types";

export const metadata: Metadata = { title: "Find parking · ParkSpotZ" };

// The entry screen. Visitors who are not logged in get the search screen
// straight away (guest mode); logged-in users go to their own home page.
export default async function Home(props: PageProps<"/">) {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return <SearchPageContent query={await props.searchParams} />;
}
