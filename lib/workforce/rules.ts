export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function businessDaysBetween(
  start: string,
  end: string,
  holidays: string[] = [],
) {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (
    Number.isNaN(first.valueOf()) ||
    Number.isNaN(last.valueOf()) ||
    last < first
  )
    return 0;
  const excluded = new Set(holidays);
  let days = 0;
  for (
    const cursor = new Date(first);
    cursor <= last;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    if (
      cursor.getDay() !== 0 &&
      cursor.getDay() !== 6 &&
      !excluded.has(dateKey(cursor))
    )
      days += 1;
  }
  return days;
}

export function attendanceAction(
  clockIn: string | null,
  clockOut: string | null,
) {
  if (!clockIn) return "CLOCK_IN" as const;
  if (!clockOut) return "CLOCK_OUT" as const;
  return "COMPLETE" as const;
}

export function isLate(
  clockIn: Date,
  scheduledStart: Date,
  graceMinutes: number,
) {
  return (
    clockIn.valueOf() >
    scheduledStart.valueOf() + Math.max(0, graceMinutes) * 60_000
  );
}
