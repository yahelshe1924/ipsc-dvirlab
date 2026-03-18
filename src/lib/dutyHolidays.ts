// lib/dutyHolidays.ts
import { HebrewCalendar } from "@hebcal/core";

export type DutyHolidayType = "jewish" | "israeli";

export type DutyHolidayInfo = {
  key: string;
  nameEn: string;
  nameHe: string;
  type: DutyHolidayType;
};

const EXCLUDED_JEWISH_HOLIDAYS = new Set<string>([
  "rosh chodesh",
]);

const INCLUDED_ISRAELI_HOLIDAYS = new Set<string>([
  "yom hazikaron",
  "yom haatzmaut",
]);

function normalizeHolidayName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['"`׳״-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function uniqueByKey<T extends { key: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    result.push(item);
  }

  return result;
}

function getCalendarRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start, end };
}

function getJewishDutyHolidays(date: Date): DutyHolidayInfo[] {
  const { start, end } = getCalendarRange(date);

  const events = HebrewCalendar.calendar({
    start,
    end,
    il: true,
    noModern: true,
  });

  const holidays: DutyHolidayInfo[] = events
    .filter((ev) => sameLocalDate(ev.greg(), date))
    .map((ev) => {
      const nameEn = ev.getDesc();
      const nameHe = ev.render("he");
      const key = normalizeHolidayName(nameEn);

      return {
        key,
        nameEn,
        nameHe,
        type: "jewish" as const,
      };
    })
    .filter((holiday) => !EXCLUDED_JEWISH_HOLIDAYS.has(holiday.key));

  return uniqueByKey(holidays);
}

function getIsraeliDutyHolidays(date: Date): DutyHolidayInfo[] {
  const { start, end } = getCalendarRange(date);

  const events = HebrewCalendar.calendar({
    start,
    end,
    il: true,
  });

  const holidays: DutyHolidayInfo[] = events
    .filter((ev) => sameLocalDate(ev.greg(), date))
    .map((ev) => {
      const nameEn = ev.getDesc();
      const nameHe = ev.render("he");
      const key = normalizeHolidayName(nameEn);

      return {
        key,
        nameEn,
        nameHe,
        type: "israeli" as const,
      };
    })
    .filter((holiday) => INCLUDED_ISRAELI_HOLIDAYS.has(holiday.key));

  return uniqueByKey(holidays);
}

export function getDutyHolidays(date: Date): DutyHolidayInfo[] {
  const jewish = getJewishDutyHolidays(date);
  const israeli = getIsraeliDutyHolidays(date);

  return uniqueByKey([...jewish, ...israeli]);
}

export function isDutyHoliday(date: Date): boolean {
  return getDutyHolidays(date).length > 0;
}

export function getDutyHolidayLabel(date: Date): string | null {
  const holidays = getDutyHolidays(date);
  if (holidays.length === 0) return null;
  return holidays.map((h) => h.nameHe).join(" | ");
}

export function isIsraeliDutyHoliday(date: Date): boolean {
  return getDutyHolidays(date).some((h) => h.type === "israeli");
}

export function isJewishDutyHoliday(date: Date): boolean {
  return getDutyHolidays(date).some((h) => h.type === "jewish");
}