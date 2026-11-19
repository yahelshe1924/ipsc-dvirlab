"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { israelDate, summarize } from "./report";
import type { CompletedSplit, MediumDuty, Person, PlateRegistration } from "./report";
import styles from "./poster.module.css";

const number = new Intl.NumberFormat("he-IL");
const monthName = new Intl.DateTimeFormat("he-IL", { month: "short", timeZone: "UTC" });

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
        .select("id, performed_date, completed_at").eq("status", "completed").order("id").range(from, to)),
      readAll<PlateRegistration>((from, to) => db.from("split_registrations")
        .select("split_id, member_id, plates_count")
        .order("split_id").order("member_id").range(from, to)),
      readAll<Person>((from, to) => db.from("members").select("id, full_name").order("id").range(from, to)),
    ]).then(([duties, splits, registrations, people]) => {
      if (active) setReport(summarize(duties, splits, registrations, people, through));
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [through]);

  const rankings = [
    { key: "weekend", title: "החלפות בסופי שבוע ובחגים", unit: "החלפות" },
    { key: "volume", title: "נפח מדיום מצטבר", unit: "מ״ל" },
    { key: "plates", title: "צלחות שהוקצו לחברי הצוות", unit: "צלחות" },
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

            <section className={styles.rankings} aria-label="מובילי הפעילות">
              {rankings.map(({ key, title, unit }) => {
                const sorted = report.scores.filter((person) => person[key] > 0)
                  .sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name, "he"));
                const cutoff = sorted[2]?.[key] ?? 0;
                const leaders = sorted.filter((person) => person[key] >= cutoff);
                return (
                  <div className={styles.panel} key={key}>
                    <h2>{title}</h2>
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
            </section>

            {([
              { title: "החלפות מדיום לפי חודש", series: [
                { key: "weekday", label: "ימי חול" }, { key: "weekend", label: "סופי שבוע וחגים" },
              ] },
              { title: "הקצאת צלחות לפי חודש", series: [{ key: "plates", label: "צלחות שהוקצו" }] },
            ] as const).map(({ title, series }) => {
              const total = (month: typeof report.timeline[number]) =>
                series.reduce((sum, { key }) => sum + month[key], 0);
              const max = Math.max(1, ...report.timeline.map(total));
              return (
                <section className={styles.panel} key={title}>
                  <h2>{title}</h2>
                  <div className={styles.legend}>
                    {series.map(({ key, label }) => <span key={key} className={styles[key]}>{label}</span>)}
                  </div>
                  <div className={styles.timeline}>
                    {report.timeline.map((month) => {
                      const label = `${monthName.format(new Date(month.key + "-01T00:00:00Z"))} ${month.key.slice(2, 4)}`;
                      return (
                        <div className={styles.column} key={month.key}
                          aria-label={`${label}, ${series.map(({ key, label }) => `${label} ${month[key]}`).join(", ")}`}
                          role="img">
                          <div className={styles.plot} aria-hidden="true">
                            <span className={styles.stack} style={{ height: `${total(month) / max * 100}%` }}>
                              <strong>{number.format(total(month))}</strong>
                              {series.map(({ key }) => (
                                <span key={key} className={styles[key]} style={{ flexGrow: month[key] }} />
                              ))}
                            </span>
                          </div>
                          <span aria-hidden="true">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            <footer className={styles.notes}>
              <p><strong>{report.medium ? number.format(Math.round(report.weekend / report.medium * 100)) : "0"}%</strong> מהחלפות המדיום בוצעו בסופי שבוע ובחגים.</p>
              <p>הדוח כולל פעולות שסומנו כהושלמו. החלפות מדיום משויכות לאחראי הרשום ביומן. סופי שבוע כוללים שישי ושבת, והחגים מסווגים לפי מסך הסטטיסטיקה. נפח המדיום מבוסס על הערך השמור באפליקציה, שכיום מתעד 12 מ״ל להחלפה. צלחות נספרות לפי ההקצאות לחברי צוות בפיצולים שהושלמו.</p>
            </footer>
          </div>
        )}
      </article>
    </div>
  );
}
