export type Role = "customer" | "owner" | "attendant" | "admin";

export interface User {
  id: number;
  username: string;
  role: Role;
}

// Where each role lands after logging in.
export function homeFor(role: Role): string {
  if (role === "owner") return "/owner/spaces";
  if (role === "admin") return "/admin";
  return role === "attendant" ? "/attendant" : "/search";
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
  // Set once the vehicle has left: when it came and went, and any overstay.
  visit: {
    entry_at: string;
    exit_at: string;
    overstay_minutes: number;
    overstay_amount: number;
    overstay_settlement: "none" | "cash" | "upi" | "waived";
  } | null;
}

export interface PaymentInfo {
  mode: "mock" | "razorpay";
  order_id: string | null;
  currency: string;
  key_id?: string; // Razorpay public key id, razorpay mode only
}

// The one status shown to customers for a booking.
export function bookingState(booking: Booking): "confirmed" | "cancelled" | "expired" | "awaiting payment" {
  if (booking.status !== "pending") return booking.status;
  return booking.is_expired ? "expired" : "awaiting payment";
}

// Only paths inside this site are accepted as a "go here after login" target.
export function safeNextPath(value: unknown): string | null {
  return typeof value === "string" && /^\/(?!\/)[^\\]*$/.test(value) ? value : null;
}

// A confirmed booking as an owner sees it.
export interface OwnerBooking {
  id: number;
  reference: string;
  space_name: string;
  customer: string;
  start_time: string;
  end_time: string;
  amount: number;
}

// One vehicle visit in the gate log. Carries no amounts.
export interface Visit {
  id: number;
  space_id: number;
  space_name: string;
  reference: string; // booking reference, e.g. "PSZ-000042"
  customer: string;
  start_time: string; // booked window
  end_time: string;
  vehicle_number: string | null;
  entry_at: string;
  entry_by: string;
  exit_at: string | null;
  exit_by: string | null;
  has_photo: boolean;
  // Overstay: while the vehicle is inside these are the server's figures as
  // of when the page was loaded; after exit they are what was recorded.
  overstay_minutes: number;
  overstay_amount: number;
  overstay_settlement: "none" | "cash" | "upi" | "waived" | null; // null while inside
  overstay_waive_reason: string | null;
  overstay_rule: OverstayRule;
}

// How overstay is charged at a space (see the API's overstay.ts).
export interface OverstayRule {
  grace_minutes: number; // free minutes after the booked end
  block_minutes: number; // billed in started blocks of this length
  block_amount: number; // price of one block
  price_per_hour: number;
}

// What gate staff see after scanning a receipt's QR code.
export interface GateView {
  valid: boolean;
  timing?: "upcoming" | "current" | "over";
  can_enter?: boolean; // entry may be recorded right now
  entry_opens_at?: string; // from when entry may be recorded
  booking?: {
    reference: string;
    space_name: string;
    space_address: string;
    customer: string;
    start_time: string;
    end_time: string;
    amount?: number; // owners only; attendants never receive it
  };
  visit?: Visit | null;
  now?: string; // server time
}

// The attendant's home screen.
export interface GateHome {
  space: { id: number; name: string; address: string; total_slots: number; open_time: string; close_time: string };
  inside: Visit[];
  expected: { reference: string; qr_token: string; customer: string; start_time: string; end_time: string }[];
  now: string; // server time
}

export interface Attendant {
  id: number;
  username: string;
  created_at: string;
}

export interface OwnerStats {
  period: "day" | "week" | "month";
  from: string | null; // first IST day of the period, "YYYY-MM-DD"
  to: string | null; // last IST day of the period
  // overstay_collected = overstay charges taken in cash or UPI at the gate;
  // overstay_waived = charges that were due but waived. Neither is in `revenue`.
  spaces: {
    space_id: number;
    space_name: string;
    bookings: number;
    hours: number;
    revenue: number;
    overstay_collected: number;
    overstay_waived: number;
  }[];
  total: { bookings: number; hours: number; revenue: number; overstay_collected: number; overstay_waived: number };
}

// --- Monthly rental and the platform admin -----------------------------------

export interface RentalTier {
  name: string;
  min_slots: number;
  max_slots: number | null; // null = no upper limit
  monthly_fee: number;
}

export interface RentalInvoice {
  id: number;
  reference: string; // e.g. "RNT-000012"
  space_id: number;
  space_name: string;
  owner: string;
  month: string; // "YYYY-MM"
  tier_name: string;
  slots: number;
  amount: number;
  due_date: string; // "YYYY-MM-DD"
  status: "due" | "paid";
  overdue: boolean; // due and past the due date
  paid_at: string | null;
}

export interface UsageFigure {
  booked_hours: number;
  available_hours: number;
  percent: number;
}

export type RentalStatus = "paid" | "due" | "overdue" | "free" | "none";

export interface AdminDashboard {
  spaces: { total: number; active: number; inactive: number; added_this_month: number };
  users: { owners: number; attendants: number; customers: number };
  slots: { total: number; by_tier: (RentalTier & { spaces: number; slots: number })[] };
  in_use: { vehicles_inside: number; slots_booked_now: number };
  utilisation: Record<"day" | "week" | "month", UsageFigure>;
  rental: { month: string; invoiced: number; collected: number; outstanding: number; overdue_count: number };
  bookings: Record<"day" | "week" | "month", { count: number; revenue: number }>;
}

export interface AdminSpace {
  id: number;
  name: string;
  owner: string;
  address: string;
  total_slots: number;
  tier: string | null;
  is_active: boolean;
  created_at: string;
  bookings_month: number;
  utilisation_month: UsageFigure;
  rental_status: RentalStatus;
}

export interface AdminRental {
  month: string;
  status: "all" | "due" | "paid" | "overdue";
  tiers: RentalTier[];
  invoices: RentalInvoice[];
  totals: { invoices: number; invoiced: number; collected: number; outstanding: number; overdue_count: number };
}
