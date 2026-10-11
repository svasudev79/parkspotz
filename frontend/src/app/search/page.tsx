import type { Metadata } from "next";
import { SearchScreen } from "@/components/SearchScreen";
import { searchWindow, type Search, type SearchForm } from "@/lib/search";
import { apiGet, requireRole } from "@/lib/session";
import type { SearchResult } from "@/lib/types";

export const metadata: Metadata = { title: "Find parking · ParkSpotZ" };

type Query = Record<string, string | string[] | undefined>;

// Reads a search back out of the URL (?name&lat&lng&radius&date&time&hours).
function parseForm(query: Query): SearchForm | null {
  const text = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const lat = Number(text("lat"));
  const lng = Number(text("lng"));
  const radius = Number(text("radius"));
  const hours = Number(text("hours"));
  const valid =
    text("name") !== "" &&
    text("lat") !== "" &&
    text("lng") !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    radius > 0 &&
    hours > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(text("date")) &&
    /^\d{2}:\d{2}$/.test(text("time"));
  if (!valid) return null;
  return {
    destination: { name: text("name").slice(0, 200), lat, lng },
    radius,
    date: text("date"),
    time: text("time"),
    hours,
  };
}

export default async function SearchPage(props: PageProps<"/search">) {
  await requireRole("driver");
  const form = parseForm(await props.searchParams);

  // A search in the URL is run straight away, so Back from a space page (or a
  // reload) shows the same results again.
  let search: Search | null = null;
  let searchFailed = false;
  if (form) {
    const { start, end } = searchWindow(form);
    if (!Number.isNaN(start.getTime())) {
      const query = new URLSearchParams({
        lat: String(form.destination.lat),
        lng: String(form.destination.lng),
        radius: String(form.radius),
        start: start.toISOString(),
        end: end.toISOString(),
      });
      const data = await apiGet<{ spaces: SearchResult[] }>(`/spaces?${query}`);
      if (data) {
        search = {
          destination: form.destination,
          radius: form.radius,
          start: start.toISOString(),
          end: end.toISOString(),
          results: data.spaces,
        };
      } else {
        searchFailed = true;
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Find parking</h1>
      <SearchScreen initialForm={form} search={search} searchFailed={searchFailed} />
    </main>
  );
}
