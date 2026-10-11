export type Role = "driver" | "owner";

export interface User {
  id: number;
  username: string;
  role: Role;
}

// Where each role lands after logging in.
export function homeFor(role: Role): string {
  return role === "owner" ? "/owner/spaces" : "/search";
}

export const SPACE_TYPES = ["basement", "multilevel", "surface"] as const;
export const OWNERSHIPS = ["public", "private", "metro"] as const;

export interface Space {
  id: number;
  owner_id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  space_type: (typeof SPACE_TYPES)[number];
  ownership: (typeof OWNERSHIPS)[number];
  total_slots: number;
  price_per_hour: number;
  open_time: string; // "HH:MM", IST
  close_time: string; // "HH:MM", IST
  is_active: boolean;
}

// A space in search results, for one destination and time window.
export interface SearchResult extends Space {
  distance_m: number;
  slots_available: number;
  is_open: boolean; // false when the window is outside opening hours
}
