"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getColor } from "@/lib/colors";
import { createClient } from "@/lib/supabase";
import { israelDate, summarize } from "./report";
import type { CompletedSplit, MediumDuty, Person, PlateRegistration } from "./report";
import styles from "./poster.module.css";

const number = new Intl.NumberFormat("he-IL");
const monthName = new Intl.DateTimeFormat("he-IL", { month: "short", timeZone: "UTC" });

function monthLabel(key: string) {
  return monthName.format(new Date(key + "-01T00:00:00Z")) + " " + key.slice(2, 4);
}

function MediumChart({ report }: { report: ReturnType<typeof summarize> }) {
  const members = report.scores.slice().sort((a, b) => a.name.localeCompare(b.name, "he"))
    .map(({ id, name, colorIndex }) => ({ id: id as string | null, name, color: getColor(colorIndex).bg }));
  members.push({ id: null, name: "ללא שיוך", color: "#66727a" });
  const percent = new Intl.NumberFormat("he-IL", { style: "percent", maximumFractionDigits: 1 });

  return (
    <section className={styles.panel}>
      <h2>החלפות מדיום לפי חודש</h2>
      <p className={styles.unit}>חלקו של כל חבר צוות מתוך כלל ההחלפות שהושלמו בחודש</p>
      <div className={styles.mediumMonths}>
        {report.timeline.map(({ key, mediumCounts }) => {
          const total = Array.from(mediumCounts.values()).reduce((sum, count) => sum + count, 0);
          const entries = members.flatMap((member) => {
            const count = mediumCounts.get(member.id);
            return count ? [{ ...member, count, share: count / total }] : [];
          });
          return (
            <div className={styles.mediumMonth} key={key}>
              <h3>{monthLabel(key)} <span>· {number.format(total)} החלפות</span></h3>
              {total > 0 && (
                <>
                  <div className={styles.percentBar} aria-hidden="true">
                    {entries.map(({ id, name, color, count, share }) => (
                      <span key={id ?? "unassigned"} title={name + " · " + count + " · " + percent.format(share)}
                        style={{ width: (share * 100) + "%", background: color }} />
                    ))}
                  </div>
                  <ul className={styles.breakdown}>
                    {entries.map(({ id, name, color, count, share }) => (
                      <li key={id ?? "unassigned"}>
                        <span className={styles.swatch} style={{ background: color }} aria-hidden="true" />
                        <bdi>{name}</bdi> {number.format(count)} ({percent.format(share)})
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await page(offset, offset + size - 1);
    if (error || !data) throw error ?? new Error("Missing report data");
    rows.push(...data);
    if (data.length < size) return rows;
  }
}

export default function PosterPage() {
  const [through] = useState(() => israelDate.format(new Date()));
  const [report, setReport] = useState<ReturnType<typeof summarize>>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const db = createClient();
    let active = true;
    Promise.all([
      readAll<MediumDuty>((from, to) => db.from("duty_assignments")
        .select("duty_date, member_id, volume_ml").not("volume_ml", "is", null)
        .lte("duty_date", through).order("duty_date").range(from, to)),
      readAll<CompletedSplit>((from, to) => db.from("splits")
        .select("id, performed_date, completed_at, completed_by_member_id, actual_plate_count, maintenance_plate_count, flow_plate_count")
        .eq("status", "completed").order("id").range(from, to)),
      readAll<PlateRegistration>((from, to) => db.from("split_registrations")
        .select("split_id, member_id, plates_count")
        .order("split_id").order("member_id").range(from, to)),
      readAll<Person>((from, to) => db.from("members").select("id, full_name, color_index").order("id").range(from, to)),
    ]).then(([duties, splits, registrations, people]) => {
      if (active) setReport(summarize(duties, splits, registrations, people, through));
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [through]);

  const maxMonthlyPlates = Math.max(1, ...(report?.timeline.map(({ plates }) => plates) ?? []));
  const activityRankings = [
    { key: "weekend", title: "החלפות בסופי שבוע ובחגים", unit: "החלפות" },
    { key: "volume", title: "נפח מדיום מצטבר", unit: "מ״ל" },
    { key: "plates", title: "צלחות שהוקצו לחברי הצוות", unit: "צלחות" },
  ] as const;

  const splitRankings = [
    { key: "splits", title: "פיצולים שבוצעו", unit: "פיצולים" },
    { key: "splitPlates", title: "צלחות שהוכנו בפיצולים", unit: "צלחות" },
    { key: "weekendSplits", title: "פיצולים בסופי שבוע ובחגים", unit: "פיצולים" },
  ] as const;

  return (
    <div className={styles.page} dir="rtl" lang="he">
      <nav className={styles.actions} aria-label="פעולות הדוח">
        <Link href="/stats">חזרה לסטטיסטיקות</Link>
        {report?.start && <button onClick={() => window.print()}>הדפסה / שמירה כ־PDF</button>}
      </nav>
      <article className={styles.poster}>
        <header className={styles.hero}>
          <p dir="ltr">iPSC · DvirLab</p>
          <h1>המעבדה במספרים</h1>
          {report?.start && <p>מהפעילות הראשונה שתועדה ועד היום · <bdi>{report.start} — {through}</bdi></p>}
        </header>
        {!report?.start ? (
          <p className={styles.status} role="status">
            {failed ? "טעינת הדוח נכשלה. אפשר לרענן את הדף ולנסות שוב." :
              report ? "אין פעילות שהושלמה בתקופה הזו." : "טוען את נתוני הפעילות…"}
          </p>
        ) : (
          <div className={styles.content}>
            <section className={styles.totals} aria-label="מדדים מצטברים">
              {[
                ["החלפות מדיום", report.medium],
                ["מ״ל מדיום", report.volume],
                ["צלחות שהוקצו", report.plates],
                ["פיצולים שהושלמו", report.splits],
              ].map(([label, value]) => (
                <div key={label}><strong>{number.format(Number(value))}</strong><span>{label}</span></div>
              ))}
            </section>

            {[
              { title: "מובילי החלפות המדיום והקצאות הצלחות", rankings: activityRankings },
              { title: "מובילי הפיצולים", rankings: splitRankings },
            ].map(({ title: groupTitle, rankings }) => (
              <section className={styles.rankingGroup} key={groupTitle} aria-label={groupTitle}>
                <h2>{groupTitle}</h2>
                <div className={styles.rankings}>
                  {rankings.map(({ key, title, unit }) => {
                    const sorted = report.scores.filter((person) => person[key] > 0)
                      .sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name, "he"));
                    const cutoff = sorted[2]?.[key] ?? 0;
                    const leaders = sorted.filter((person) => person[key] >= cutoff);
                    return (
                      <div className={styles.panel} key={key}>
                        <h3>{title}</h3>
                        <p className={styles.unit}>{unit}</p>
                        {leaders.length ? (
                          <ol className={styles.leaders}>
                            {leaders.map((person) => (
                              <li key={person.id}>
                                <div><bdi>{person.name}</bdi><strong>{number.format(person[key])}</strong></div>
                                <span className={styles.track} aria-hidden="true">
                                  <span style={{ width: `${person[key] / leaders[0][key] * 100}%` }} />
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : <p>אין נתונים משויכים לחברי צוות</p>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            <MediumChart report={report} />
            <section className={styles.panel}>
              <h2>הקצאת צלחות לפי חודש</h2>
              <div className={styles.timeline}>
                {report.timeline.map(({ key, plates }) => (
                  <div className={styles.column} key={key}>
                    <div className={styles.plot}>
                      <span className={styles.stack} style={{ height: (plates / maxMonthlyPlates * 100) + "%" }}>
                        <strong>{number.format(plates)}</strong>
                        <span className={styles.plates} style={{ flexGrow: 1 }} />
                      </span>
                    </div>
                    <span>{monthLabel(key)}</span>
                  </div>
                ))}
              </div>
            </section>
            <footer className={styles.notes}>
              <p><strong>{report.medium ? number.format(Math.round(report.weekend / report.medium * 100)) : "0"}%</strong> מהחלפות המדיום בוצעו בסופי שבוע ובחגים.</p>
              <p>הדוח כולל פעולות שסומנו כהושלמו. החלפות מדיום משויכות לאחראי הרשום ביומן. סופי שבוע כוללים שישי ושבת, והחגים מסווגים לפי מסך הסטטיסטיקה. נפח המדיום מבוסס על הערך השמור באפליקציה, שכיום מתעד 12 מ״ל להחלפה. צלחות שהוקצו נספרות לפי הרישום לחברי הצוות בפיצולים שהושלמו. בדירוג הפיצולים, הפעילות משויכת למי שרשום כמבצע. מספר הצלחות שהוכנו כולל צלחות לצוות, לתחזוקה ול־Flow, עבור פיצולים שבהם נשמרה ספירה בפועל.</p>
            </footer>
          </div>
        )}
      </article>
    </div>
  );
}
