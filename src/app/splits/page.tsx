"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type Split = {
  id: string;
  split_number: number;
  flow_plate_count: number;
  maintenance_plate_count: number;
};

export default function SplitsPage() {
  const supabase = createClient();

  const [splits, setSplits] = useState<Split[]>([]);

  useEffect(() => {
    loadSplits();
  }, []);

  async function loadSplits() {
    const { data, error } = await supabase
      .from("splits")
      .select("*")
      .eq("status", "open")
      .order("split_number", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setSplits(data || []);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>פיצולים פתוחים</h1>

      {splits.map((s) => (
        <div
          key={s.id}
          style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 10,
          }}
        >
          <div>פיצול {s.split_number}</div>
          <div>Flow: {s.flow_plate_count}</div>
        </div>
      ))}
    </div>
  );
}