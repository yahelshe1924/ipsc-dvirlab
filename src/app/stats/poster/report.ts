import { getDayCategory } from "@/lib/holidays";

export type MediumDuty = { duty_date: string; member_id: string | null };
export type CompletedSplit = {
  id: string;
  performed_date: string | null;
  completed_at: string | null;
  completed_by_member_id: string | null;
  actual_plate_count: number | null;
  maintenance_plate_count: number | null;
  flow_plate_count: number | null;
};
export type PlateRegistration = { split_id: string; member_id: string | null; plates_count: number };
export type Person = { id: string; full_name: string; color_index: number };

type MonthStats = { mediumCounts: Map<string | null, number>; plates: number };

export const israelDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" });

function isWeekendOrHoliday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return getDayCategory(year, month - 1, day) !== "weekday";
}

export function summarize(
  duties: MediumDuty[],
  splits: CompletedSplit[],
  registrations: PlateRegistration[],
  people: Person[],
  through: string,
) {
  const scores = new Map(people.map(({ id, full_name, color_index }) => [
    id, {
      id, name: full_name, colorIndex: color_index, weekday: 0, weekend: 0,
      splits: 0, splitPlates: 0, weekendSplits: 0,
    },
  ]));
  const months = new Map<string, MonthStats>();
  let start = "";
  function monthFor(date: string) {
    if (!start || date < start) start = date;
    const key = date.slice(0, 7);
    const month = months.get(key) ?? { mediumCounts: new Map<string | null, number>(), plates: 0 };
    months.set(key, month);
    return month;
  }

  let plates = 0;
  const splitDates = new Map<string, string>();
  for (const split of splits) {
    const date = split.performed_date ?? (split.completed_at && israelDate.format(new Date(split.completed_at)));
    if (!date || date > through) continue;
    splitDates.set(split.id, date);
    monthFor(date);

    const performer = split.completed_by_member_id && scores.get(split.completed_by_member_id);
    if (!performer) continue;
    performer.splits++;
    if (isWeekendOrHoliday(date)) performer.weekendSplits++;
    if (split.actual_plate_count !== null) {
      performer.splitPlates += split.actual_plate_count
        + (split.maintenance_plate_count ?? 0) + (split.flow_plate_count ?? 0);
    }
  }
  for (const registration of registrations) {
    const date = splitDates.get(registration.split_id);
    if (!date) continue;
    monthFor(date).plates += registration.plates_count;
    plates += registration.plates_count;
  }

  let medium = 0;
  let weekend = 0;
  for (const duty of duties) {
    if (duty.duty_date > through) continue;
    const day = new Date(duty.duty_date + "T00:00:00Z").getUTCDay();
    const isWeekend = day === 5 || day === 6;
    const counts = monthFor(duty.duty_date).mediumCounts;
    const memberId = duty.member_id && scores.has(duty.member_id) ? duty.member_id : null;
    counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
    medium++;
    if (isWeekend) weekend++;
    const score = duty.member_id && scores.get(duty.member_id);
    if (score) score[isWeekend ? "weekend" : "weekday"]++;
  }

  const timeline: (MonthStats & { key: string })[] = [];
  if (start) {
    const cursor = new Date(start.slice(0, 7) + "-01T00:00:00Z");
    while (cursor.toISOString().slice(0, 7) <= through.slice(0, 7)) {
      const key = cursor.toISOString().slice(0, 7);
      timeline.push({ key, ...(months.get(key) ?? { mediumCounts: new Map<string | null, number>(), plates: 0 }) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  return { start, timeline, scores: Array.from(scores.values()), medium, weekend, plates, splits: splitDates.size };
}
