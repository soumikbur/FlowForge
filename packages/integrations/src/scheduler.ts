/**
 * FlowForge Timezone-Aware Scheduling Engine
 */

export function isValidCron(cron: string): boolean {
  if (!cron || typeof cron !== "string") return false;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [min, hr, dom, mon, dow] = parts;
  return (
    validateField(min, 0, 59) &&
    validateField(hr, 0, 23) &&
    validateField(dom, 1, 31) &&
    validateField(mon, 1, 12) &&
    validateField(dow, 0, 6)
  );
}

function validateField(field: string, min: number, max: number): boolean {
  if (field === "*") return true;
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0 && step <= max;
  }
  if (field.includes(",")) {
    return field
      .split(",")
      .every((sub) => validateField(sub.trim(), min, max));
  }
  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    return (
      !isNaN(start) &&
      !isNaN(end) &&
      start >= min &&
      end <= max &&
      start <= end
    );
  }
  const val = parseInt(field, 10);
  return !isNaN(val) && val >= min && val <= max;
}

export function matchField(pattern: string, val: number): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*/")) {
    const step = parseInt(pattern.slice(2), 10);
    return !isNaN(step) && step > 0 && val % step === 0;
  }
  if (pattern.includes(",")) {
    return pattern.split(",").some((p) => matchField(p.trim(), val));
  }
  if (pattern.includes("-")) {
    const [start, end] = pattern.split("-").map(Number);
    return val >= start && val <= end;
  }
  const num = parseInt(pattern, 10);
  return num === val;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts date components for a given timestamp in a specified IANA time zone.
 */
function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      partMap[p.type] = parseInt(p.value, 10);
    }
  }

  // Calculate day of week (0=Sunday ... 6=Saturday)
  const d = new Date(date);
  const dowFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });
  const weekdayShort = dowFormatter.format(d);
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekdayShort,
  );

  return {
    year: partMap.year,
    month: partMap.month,
    day: partMap.day,
    hour: partMap.hour,
    minute: partMap.minute,
    second: partMap.second || 0,
    weekday: dayIndex >= 0 ? dayIndex : d.getUTCDay(),
  };
}

/**
 * Calculates next execution occurrence Date (in UTC) for a cron expression
 * evaluated in the specified IANA time zone.
 */
export function calculateNextCronRun(
  cron: string,
  fromDate: Date = new Date(),
  timeZone: string = "UTC",
): Date {
  if (!isValidCron(cron)) {
    throw new Error(`Invalid cron expression: ${cron}`);
  }
  if (!isValidTimeZone(timeZone)) {
    throw new Error(`Invalid IANA time zone identifier: ${timeZone}`);
  }

  const [minPattern, hrPattern, domPattern, monPattern, dowPattern] = cron
    .trim()
    .split(/\s+/);

  // Start from next minute boundary
  let cursor = new Date(fromDate.getTime());
  cursor.setSeconds(0, 0);
  cursor = new Date(cursor.getTime() + 60 * 1000);

  // Maximum search horizon: 5 years (approx 2.6 million minutes)
  const maxIterations = 60 * 24 * 365 * 5;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    const zoned = getZonedParts(cursor, timeZone);

    if (
      matchField(monPattern, zoned.month) &&
      matchField(domPattern, zoned.day) &&
      matchField(dowPattern, zoned.weekday) &&
      matchField(hrPattern, zoned.hour) &&
      matchField(minPattern, zoned.minute)
    ) {
      return cursor;
    }

    // Step forward by 1 minute
    cursor = new Date(cursor.getTime() + 60 * 1000);
  }

  throw new Error(
    `No upcoming occurrence found within horizon for cron expression: ${cron}`,
  );
}

/**
 * Calculates next schedule run date based on either recurring cron or one-time scheduledAt.
 */
export function calculateNextScheduleRun(
  schedule: {
    cronExpression?: string;
    scheduledAt?: Date | string;
    timezone?: string;
  },
  fromDate: Date = new Date(),
): Date | undefined {
  if (schedule.scheduledAt) {
    const oneTimeDate = new Date(schedule.scheduledAt);
    if (oneTimeDate.getTime() > fromDate.getTime()) {
      return oneTimeDate;
    }
    return undefined; // Already in the past
  }

  if (schedule.cronExpression) {
    return calculateNextCronRun(
      schedule.cronExpression,
      fromDate,
      schedule.timezone || "UTC",
    );
  }

  return undefined;
}
