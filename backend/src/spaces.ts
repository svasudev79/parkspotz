// Parking space input validation and the JSON shape sent to clients.

export const SPACE_TYPES = ["basement", "multilevel", "surface"] as const;
export const OWNERSHIPS = ["public", "private", "metro"] as const;

export interface SpaceInput {
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

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= max ? trimmed : null;
}

// Checks a complete space. Returns the cleaned values, or an error message.
export function validateSpace(body: Record<string, unknown>): { space: SpaceInput } | { error: string } {
  const name = text(body.name, 100);
  if (!name) return { error: "Name is required (up to 100 characters)" };
  const address = text(body.address, 300);
  if (!address) return { error: "Address is required (up to 300 characters)" };

  const { lat, lng, space_type, ownership, total_slots, price_per_hour, open_time, close_time } = body;
  if (!isNumber(lat) || lat < -90 || lat > 90) return { error: "Latitude must be between -90 and 90" };
  if (!isNumber(lng) || lng < -180 || lng > 180) return { error: "Longitude must be between -180 and 180" };

  if (!SPACE_TYPES.includes(space_type as SpaceInput["space_type"])) {
    return { error: `Type must be one of: ${SPACE_TYPES.join(", ")}` };
  }
  if (!OWNERSHIPS.includes(ownership as SpaceInput["ownership"])) {
    return { error: `Ownership must be one of: ${OWNERSHIPS.join(", ")}` };
  }

  if (!isNumber(total_slots) || !Number.isInteger(total_slots) || total_slots < 1 || total_slots > 10000) {
    return { error: "Number of slots must be a whole number, 1 or more" };
  }
  if (!isNumber(price_per_hour) || price_per_hour < 0 || price_per_hour > 100000) {
    return { error: "Price per hour must be 0 or more" };
  }

  if (typeof open_time !== "string" || !TIME_PATTERN.test(open_time)) {
    return { error: "Opening time must look like 08:00" };
  }
  if (typeof close_time !== "string" || !TIME_PATTERN.test(close_time)) {
    return { error: "Closing time must look like 22:00" };
  }
  if (close_time <= open_time) return { error: "Closing time must be after opening time" };

  const is_active = body.is_active ?? true;
  if (typeof is_active !== "boolean") return { error: "is_active must be true or false" };

  return {
    space: {
      name,
      address,
      lat,
      lng,
      space_type: space_type as SpaceInput["space_type"],
      ownership: ownership as SpaceInput["ownership"],
      total_slots,
      price_per_hour: Math.round(price_per_hour * 100) / 100,
      open_time,
      close_time,
      is_active,
    },
  };
}

// Turns a parking_spaces row into JSON: numeric price as a number, times as "HH:MM".
export function toSpace(row: Record<string, unknown>) {
  return {
    ...row,
    price_per_hour: Number(row.price_per_hour),
    open_time: String(row.open_time).slice(0, 5),
    close_time: String(row.close_time).slice(0, 5),
  };
}

// A space as anyone may see it (search results, the space page): no owner id
// and no creation date. The owner's own id is added back only for that owner,
// who needs it to manage the space.
export function toPublicSpace(row: Record<string, unknown>, viewerId?: number) {
  const { owner_id, created_at: _createdAt, ...space } = toSpace(row) as Record<string, unknown>;
  return viewerId !== undefined && viewerId === owner_id ? { ...space, owner_id } : space;
}

// Positive integer id from a URL, or null.
export function parseId(value: unknown): number | null {
  return typeof value === "string" && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
}
