// SQL shared by search (and, later, booking) so both count slots the same way.

// Condition on a bookings row aliased `b`: true when it still holds a slot.
// Confirmed bookings always do; pending (unpaid) ones only while younger than
// the hold duration, passed in minutes as the parameter at `holdParam`.
export function holdsSlotSql(holdParam: string): string {
  return `(b.status = 'confirmed'
    OR (b.status = 'pending' AND b.created_at > now() - make_interval(mins => ${holdParam}::int)))`;
}

// Number of bookings holding a slot in space `spaceExpr` that overlap the
// window [startParam, endParam). Windows that only touch do not overlap.
export function overlappingBookingsSql(spaceExpr: string, startParam: string, endParam: string, holdParam: string): string {
  return `(SELECT count(*)::int FROM bookings b
    WHERE b.space_id = ${spaceExpr}
      AND b.start_time < ${endParam}::timestamptz
      AND b.end_time > ${startParam}::timestamptz
      AND ${holdsSlotSql(holdParam)})`;
}

// True when the window falls on one IST day inside the space's opening hours.
// `s` is the parking_spaces alias.
export function withinOpeningHoursSql(startParam: string, endParam: string): string {
  const start = `(${startParam}::timestamptz AT TIME ZONE 'Asia/Kolkata')`;
  const end = `(${endParam}::timestamptz AT TIME ZONE 'Asia/Kolkata')`;
  return `(${start}::date = ${end}::date
    AND ${start}::time >= s.open_time
    AND ${end}::time <= s.close_time)`;
}
