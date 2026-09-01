"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { WATCHLIST } from "@/lib/types";

type BiasEntry = {
  id?: string;
  instrument: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  key_levels: string;
  notes: string;
};

function currentWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

export default function WeeklyBiasPage() {
  const supabase = createClient();
  const weekOf = currentWeekStart();
  const [entries, setEntries] = useState<Record<string, BiasEntry>>(
    Object.fromEntries(
      WATCHLIST.map((w) => [w, { instrument: w, bias: "Neutral", key_levels: "", notes: "" }])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("weekly_bias")
      .select("*")
      .eq("week_of", weekOf)
      .then(({ data, error }) => {
        if (error) return;
        if (data && data.length > 0) {
          setEntries((prev) => {
            const next = { ...prev };
            for (const row of data) {
              next[row.instrument] = row;
            }
            return next;
          });
        }
      });
  }, []);

  function update(instrument: string, field: keyof BiasEntry, value: string) {
    setEntries((prev) => ({
      ...prev,
      [instrument]: { ...prev[instrument], [field]: value },
    }));
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in to save your weekly bias.");
      setSaving(false);
      return;
    }
    const rows = Object.values(entries).map((e) => ({
      user_id: user.id,
      week_of: weekOf,
      instrument: e.instrument,
      bias: e.bias,
      key_levels: e.key_levels,
      notes: e.notes,
    }));
    const { error } = await supabase
      .from("weekly_bias")
      .upsert(rows, { onConflict: "user_id,week_of,instrument" });
    if (error) setError(error.message);
    setSaving(false);
  }

  async function generateSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/weekly-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekOf, entries: Object.values(entries) }),
      });
      const data = await res.json();
      if (data.error) setSummaryError(data.error);
      else setSummary(data.summary);
    } catch {
      setSummaryError("Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Weekly bias</h1>
        <p className="text-sm text-neutral-500">Week of {weekOf}</p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {WATCHLIST.map((instrument) => {
          const e = entries[instrument];
          return (
            <div key={instrument} className="rounded-lg border border-neutral-800 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{instrument}</span>
                <select
                  value={e.bias}
                  onChange={(ev) => update(instrument, "bias", ev.target.value)}
                  className={`rounded px-2 py-1 text-xs ${
                    e.bias === "Bullish"
                      ? "bg-green-900 text-green-300"
                      : e.bias === "Bearish"
                      ? "bg-red-900 text-red-300"
                      : "bg-neutral-800 text-neutral-300"
                  }`}
                >
                  <option>Bullish</option>
                  <option>Bearish</option>
                  <option>Neutral</option>
                </select>
              </div>
              <input
                placeholder="Key levels (support / resistance)"
                value={e.key_levels}
                onChange={(ev) => update(instrument, "key_levels", ev.target.value)}
                className="mb-2 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
              />
              <textarea
                placeholder="Notes — why this bias, what would invalidate it"
                value={e.notes}
                onChange={(ev) => update(instrument, "notes", ev.target.value)}
                rows={2}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={saveAll}
          disabled={saving}
          className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save this week's bias"}
        </button>
        <button
          onClick={generateSummary}
          disabled={summaryLoading}
          className="rounded border border-neutral-700 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {summaryLoading ? "Generating…" : "Generate AI summary"}
        </button>
      </div>

      {summaryError && (
        <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">
          {summaryError}
        </div>
      )}

      {summary && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="mb-2 text-sm font-medium text-neutral-400">
            AI summary of your week
          </h2>
          <p className="whitespace-pre-wrap text-sm text-neutral-200">{summary}</p>
        </div>
      )}
    </div>
  );
}
