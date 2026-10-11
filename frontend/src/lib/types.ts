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

export interface Booking {
  id: number;
  space_id: number;
  space_name: string;
  space_address: string;
  start_time: string; // ISO, UTC
  end_time: string;
  amount: number;
  status: "pending" | "confirmed" | "cancelled";
  is_expired: boolean; // pending, but not paid within the hold time
  hold_expires_at: string;
  created_at: string;
  reference: string; // e.g. "PSZ-000042"
  verify_url: string | null; // what the receipt QR encodes; set once confirmed
}

export interface PaymentInfo {
  mode: "mock" | "razorpay";
  order_id: string | null;
  currency: string;
  key_id?: string; // Razorpay public key id, razorpay mode only
}

// The one status shown to drivers for a booking.
export function bookingState(booking: Booking): "confirmed" | "cancelled" | "expired" | "awaiting payment" {
  if (booking.status !== "pending") return booking.status;
  return booking.is_expired ? "expired" : "awaiting payment";
}
