import type { Metadata } from "next";
import { SearchPageContent } from "@/components/SearchPageContent";
import { customerOrGuest } from "@/lib/session";

export const metadata: Metadata = { title: "Find parking · ParkSpotZ" };

// Open to customers and to visitors who are not logged in (guests).
export default async function SearchPage(props: PageProps<"/search">) {
  await customerOrGuest();
  return <SearchPageContent query={await props.searchParams} />;
}
