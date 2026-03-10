/**
 * lib/holidays.ts
 * ---------------
 * Detects Jewish holidays for a given Gregorian date using @hebcal/core.
 * Holiday names are shown next to the date in the calendar cell.
 *
 * Install:  npm install @hebcal/core
 */

import { HDate, HebrewCalendar, flags } from "@hebcal/core";

// Holidays we care about for display + statistics
const RELEVANT_FLAGS =
  flags.CHAG |           // major festivals (Rosh Hashana, Yom Kippur, Sukkot, etc.)
  flags.LIGHT_CANDLES |  // erev chag
  flags.YOM_TOV_ENDS |
  flags.MINOR_FAST |     // minor fasts
  flags.SPECIAL_SHABBAT |
  flags.ROSH_CHODESH;    // optional: remove if too noisy

// Cache per year so we don't recalculate on every render
const cache: Record<number, Map<string, string>> = {};

/** Returns a map of "YYYY-MM-DD" → holiday name for the given Gregorian year. */
function buildYearMap(year: number): Map<string, string> {
  if (cache[year]) return cache[year];

  const events = HebrewCalendar.calendar({
    year,
    isHebrewYear: false,
    il: true,           // Israel mode (1-day yom tov, etc.)
    mask: RELEVANT_FLAGS,
  });

  const map = new Map<string, string>();
  for (const ev of events) {
    const d = ev.getDate().greg();
    const key = formatKey(d.getFullYear(), d.getMonth(), d.getDate());
    // If multiple events on same day, keep the most important (first)
    if (!map.has(key)) {
      map.set(key, ev.render("en"));
    }
  }

  cache[year] = map;
  return map;
}

function formatKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Returns the holiday name for a given date, or null if none.
 *
 * @example
 *   getHolidayName(2024, 9, 2)  // → "Rosh Hashana I"
 *   getHolidayName(2024, 9, 11) // → "Yom Kippur"
 *   getHolidayName(2024, 3, 4)  // → null
 */
export function getHolidayName(
  year: number,
  month: number, // 0-indexed (JS month)
  day: number
): string | null {
  const map = buildYearMap(year);
  return map.get(formatKey(year, month, day)) ?? null;
}

/**
 * Returns the day type for statistics categorisation.
 * Priority: holiday > friday/saturday > weekday
 */
export type DayCategory = "holiday" | "weekend" | "weekday";

export function getDayCategory(
  year: number,
  month: number,
  day: number
): DayCategory {
  const holidayName = getHolidayName(year, month, day);
  if (holidayName) return "holiday";

  const dow = new Date(year, month, day).getDay(); // 0=Sun … 6=Sat
  if (dow === 5 || dow === 6) return "weekend";

  return "weekday";
}
