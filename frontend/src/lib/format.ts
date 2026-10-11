// Display helpers. All times are shown in IST (Asia/Kolkata), whatever the
// device's own time zone is.
const IST = "Asia/Kolkata";

// "2026-10-12" + "10:00" (IST wall clock) -> a Date.
export function istToDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

// Tomorrow's date in IST as "YYYY-MM-DD", the default search date.
export function tomorrowInIst(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(tomorrow);
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function formatDistance(metres: number): string {
  return metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
}

export function formatRupees(amount: number): string {
  return `₹${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
