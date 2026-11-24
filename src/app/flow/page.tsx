"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase";
import styles from "./flow.module.css";

const markers = [
  { key: "ssea5_percent", label: "SSEA5" },
  { key: "tra1_60_percent", label: "TRA1-60" },
  { key: "oct4_percent", label: "OCT4" },
] as const;

type FlowResult = {
  id: string;
  performed_date: string;
  passage_number: number;
  split_id: string | null;
} & Record<(typeof markers)[number]["key"], number>;

type SourceSplit = {
  id: string;
  split_number: number;
  performed_date: string | null;
  flow_plate_count: number;
};

const pageSize = 50;

export default function FlowPage() {
  const [supabase] = useState(createClient);
  const [results, setResults] = useState<FlowResult[]>([]);
  const [splits, setSplits] = useState<SourceSplit[]>([]);
  const [splitId, setSplitId] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resultsError, setResultsError] = useState("");
  const [sourcesError, setSourcesError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const selectedSplit = splits.find((split) => split.id === splitId);

  useEffect(() => {
    let current = true;

    async function loadSources() {
      const { data, error } = await supabase
        .from("splits")
        .select("id, split_number, performed_date, flow_plate_count")
        .eq("status", "completed")
        .gt("flow_plate_count", 0)
        .order("performed_date", { ascending: false, nullsFirst: false })
        .order("split_number", { ascending: false })
        .returns<SourceSplit[]>();

      if (!current) return;
      if (error) setSourcesError("Could not load Flow sources. Reload to try again.");
      else setSplits(data ?? []);
    }

    void loadSources();
    return () => { current = false; };
  }, [supabase]);

  useEffect(() => {
    let current = true;

    async function loadResults() {
      setLoading(true);
      setResultsError("");
      const offset = page * pageSize;
      const { data, error } = await supabase
        .from("flow_results")
        .select("id, performed_date, passage_number, split_id, ssea5_percent, tra1_60_percent, oct4_percent")
        .order("performed_date", { ascending: false })
        .order("id")
        .range(offset, offset + pageSize)
        .returns<FlowResult[]>();

      if (!current) return;
      setLoading(false);
      if (error) {
        setResultsError("Could not load Flow results.");
        return;
      }
      setResults(data.slice(0, pageSize));
      setHasMore(data.length > pageSize);
    }

    void loadResults();
    return () => { current = false; };
  }, [supabase, page, refresh]);

  async function saveResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const form = event.currentTarget;
    const fields = new FormData(form);
    setSaving(true);
    setSaveError("");
    setSaved(false);

    const { error } = await supabase.from("flow_results").insert({
      performed_date: fields.get("performed_date"),
      passage_number: selectedSplit?.split_number ?? Number(fields.get("passage_number")),
      split_id: selectedSplit?.id ?? null,
      ssea5_percent: fields.get("ssea5_percent"),
      tra1_60_percent: fields.get("tra1_60_percent"),
      oct4_percent: fields.get("oct4_percent"),
    });

    setSaving(false);
    if (error) {
      setSaveError("Could not save the Flow result. Check your access and the selected source.");
      return;
    }

    form.reset();
    setSplitId("");
    setSaved(true);
    setPage(0);
    setRefresh((value) => value + 1);
  }

  return (
    <section className={styles.page}>
      <h1>Flow results</h1>

      <form className={styles.card} onSubmit={saveResult}>
        <h2>Add a result</h2>
        <fieldset disabled={saving} className={styles.fields}>
          <label>
            Flow date
            <input name="performed_date" type="date" required />
          </label>
          <label>
            Source passage
            <select value={splitId} onChange={(event) => setSplitId(event.target.value)}>
              <option value="">Enter P manually</option>
              {splits.map((split) => (
                <option key={split.id} value={split.id}>
                  P{split.split_number} · {split.performed_date ?? "Date unavailable"} · {split.flow_plate_count} Flow plate(s)
                </option>
              ))}
            </select>
          </label>
          <label>
            P
            {selectedSplit ? (
              <input key="linked" type="number" value={selectedSplit.split_number} readOnly />
            ) : (
              <input key="manual" name="passage_number" type="number" min="0" max="2147483647" step="1" required />
            )}
          </label>
          {markers.map(({ key, label }) => (
            <label key={key}>
              {label} positive (%)
              <input name={key} type="number" min="0" max="100" step="any" required />
            </label>
          ))}
          <button type="submit">{saving ? "Saving…" : "Save result"}</button>
        </fieldset>
        {sourcesError && <p role="alert">{sourcesError}</p>}
        {saveError && <p role="alert">{saveError}</p>}
        {saved && <p role="status">Flow result saved.</p>}
      </form>

      <div className={styles.card}>
        {loading ? (
          <p role="status">Loading Flow results…</p>
        ) : resultsError ? (
          <div>
            <p role="alert">{resultsError}</p>
            <button type="button" onClick={() => setRefresh((value) => value + 1)}>Retry</button>
          </div>
        ) : results.length === 0 ? (
          <p>No Flow results yet.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table aria-label="Flow results">
              <thead>
                <tr>
                  <th scope="col">Flow date</th>
                  <th scope="col">P</th>
                  {markers.map(({ key, label }) => <th key={key} scope="col">{label} positive</th>)}
                  <th scope="col">Source passage</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const source = splits.find((split) => split.id === result.split_id);
                  return (
                    <tr key={result.id}>
                      <td>{result.performed_date}</td>
                      <td>P{result.passage_number}</td>
                      {markers.map(({ key }) => <td key={key}>{result[key]}%</td>)}
                      <td>{result.split_id ? source?.performed_date ?? "Linked" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {(page > 0 || hasMore) && (
          <div className={styles.pagination}>
            <button type="button" disabled={loading || page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <button type="button" disabled={loading || !!resultsError || !hasMore} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
    </section>
  );
}
