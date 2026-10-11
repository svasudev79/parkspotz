// Search form values and results, shared by the search page (server) and the
// search screen (browser).
import { istToDate } from "./format";
import type { Place } from "./landmarks";
import type { SearchResult } from "./types";

// The search form's values. They are kept in the page URL, so that coming
// back from a space page (or reloading) restores the search.
export interface SearchForm {
  destination: Place;
  radius: number;
  date: string; // "YYYY-MM-DD", IST
  time: string; // "HH:MM", IST
  hours: number;
}

export function searchWindow(form: Pick<SearchForm, "date" | "time" | "hours">): { start: Date; end: Date } {
  const start = istToDate(form.date, form.time);
  return { start, end: new Date(start.getTime() + form.hours * 60 * 60 * 1000) };
}

// What a finished search was for; shown above the results and passed to the map.
export interface Search {
  destination: Place;
  radius: number;
  start: string; // ISO
  end: string; // ISO
  results: SearchResult[];
}
