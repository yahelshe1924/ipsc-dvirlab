import { getDayCategory } from "@/lib/holidays";

export type MediumDuty = { duty_date: string; member_id: string | null; volume_ml: number };
export type CompletedSplit = { id: string; performed_date: string | null; completed_at: string | null };
export type PlateRegistration = { split_id: string; member_id: string | null; plates_count: number };
export type Person = { id: string; full_name: string };

export const israelDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" });

export function summarize(
  duties: MediumDuty[],
  splits: CompletedSplit[],
  registrations: PlateRegistration[],
  people: Person[],
  through: string,
) {
  const scores = new Map(people.map(({ id, full_name }) => [
    id, { id, name: full_name, weekend: 0, volume: 0, plates: 0 },
  ]));
  const months = new Map<string, { weekday: number; weekend: number; splits: number; plates: number }>();
  let start = "";
  function monthFor(date: string) {
    if (!start || date < start) start = date;
    const key = date.slice(0, 7);
    const month = months.get(key) ?? { weekday: 0, weekend: 0, splits: 0, plates: 0 };
    months.set(key, month);
    return month;
  }

  let medium = 0;
  let weekend = 0;
  let volume = 0;
  let plates = 0;
  for (const duty of duties) {
    if (duty.duty_date > through) continue;
    const [y, m, d] = duty.duty_date.split("-").map(Number);
    const special = getDayCategory(y, m - 1, d) !== "weekday";
    monthFor(duty.duty_date)[special ? "weekend" : "weekday"]++;
    medium++;
    volume += duty.volume_ml;
    if (special) weekend++;
    const score = duty.member_id && scores.get(duty.member_id);
    if (score) {
      score.volume += duty.volume_ml;
      if (special) score.weekend++;
    }
  }

  const splitDates = new Map<string, string>();
  for (const split of splits) {
    const date = split.performed_date ?? (split.completed_at && israelDate.format(new Date(split.completed_at)));
    if (!date || date > through) continue;
    splitDates.set(split.id, date);
    monthFor(date).splits++;
  }
  for (const registration of registrations) {
    const date = splitDates.get(registration.split_id);
    if (!date) continue;
    monthFor(date).plates += registration.plates_count;
    plates += registration.plates_count;
    const score = registration.member_id && scores.get(registration.member_id);
    if (score) score.plates += registration.plates_count;
  }

  const timeline = [];
  if (start) {
    const cursor = new Date(start.slice(0, 7) + "-01T00:00:00Z");
    while (cursor.toISOString().slice(0, 7) <= through.slice(0, 7)) {
      const key = cursor.toISOString().slice(0, 7);
      timeline.push({ key, ...(months.get(key) ?? { weekday: 0, weekend: 0, splits: 0, plates: 0 }) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  return { start, timeline, scores: Array.from(scores.values()), medium, weekend, volume, plates, splits: splitDates.size };
}
