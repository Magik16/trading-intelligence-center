"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { WATCHLIST } from "@/lib/types";

type BiasEntry = {
  id?: string;
  instrument: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  key_levels: string;
  notes: string;
};

type HistoryRow = {
  week_of: string;
  instrument: string;
  bias: string;
  key_levels: string | null;
  notes: string | null;
};

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function addWeeks(weekOf: string, n: number): string {
  const d = new Date(weekOf + "T00:00:00");
  d.setDate(d.getDate() + n * 7);
  return mondayOf(d);
}

function emptyEntries(): Record<string, BiasEntry> {
  return Object.fromEntries(
    WATCHLIST.map((w) => [w, { instrument: w, bias: "Neutral", key_levels: "", notes: "" }])
  );
}

export default function WeeklyBiasPage() {
  const supabase = createClient();
  const [weekOf, setWeekOf] = useState(mondayOf(new Date()));
  const [entries, setEntries] = useState<Record<string, BiasEntry>>(emptyEntries());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null); // instrument name or null

  const loadWeek = useCallback(
    (week: string) => {
      setEntries(emptyEntries());
      setSummary(null);
      supabase
        .from("weekly_bias")
        .select("*")
        .eq("week_of", week)
        .then(({ data, error }) => {
          if (error) return;
          if (data && data.length > 0) {
            setEntries((prev) => {
              const next = { ...prev };
              for (const row of data) next[row.instrument] = row;
              return next;
            });
          }
        });
    },
    [supabase]
  );

  const loadHistory = useCallback(() => {
    supabase
      .from("weekly_bias")
      .select("week_of, instrument, bias, key_levels, notes")
      .lt("week_of", weekOf)
      .order("week_of", { ascending: false })
      .then(({ data }) => setHistory(data ?? []));
  }, [supabase, weekOf]);

  useEffect(() => {
    loadWeek(weekOf);
    loadHistory();
  }, [weekOf, loadWeek, loadHistory]);

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
    loadHistory();
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

  const isCurrentWeek = weekOf === mondayOf(new Date());

  // Group history by week_of, most recent first, numbered like "Week 1, Week 2..."
  const weeksDesc = Array.from(new Set(history.map((h) => h.week_of))).sort((a, b) =>
    b.localeCompare(a)
  );
  const weekNumber: Record<string, number> = {};
  weeksDesc
    .slice()
    .reverse()
    .forEach((w, idx) => (weekNumber[w] = idx + 1));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Weekly bias</h1>
          <p className="text-sm text-neutral-500">
            Week of {weekOf}
            {isCurrentWeek && " (current)"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setWeekOf(addWeeks(weekOf, -1))}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:text-white"
          >
            ← Prev week
          </button>
          <button
            onClick={() => setWeekOf(mondayOf(new Date()))}
            disabled={isCurrentWeek}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:text-white disabled:opacity-40"
          >
            This week
          </button>
          <button
            onClick={() => setWeekOf(addWeeks(weekOf, 1))}
            disabled={isCurrentWeek}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:text-white disabled:opacity-40"
          >
            Next week →
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {WATCHLIST.map((instrument) => {
          const e = entries[instrument];
          const instrumentHistory = history.filter((h) => h.instrument === instrument);
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
                placeholder="Your notes — outlook, key zones, what you're watching this week, what would invalidate the bias. Paste as much as you'd normally write."
                value={e.notes}
                onChange={(ev) => update(instrument, "notes", ev.target.value)}
                rows={6}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
              />

              {instrumentHistory.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() =>
                      setHistoryOpen(historyOpen === instrument ? null : instrument)
                    }
                    className="text-xs text-neutral-500 hover:text-neutral-300"
                  >
                    {historyOpen === instrument ? "Hide" : "Show"} history (
                    {instrumentHistory.length} past week
                    {instrumentHistory.length > 1 ? "s" : ""})
                  </button>
                  {historyOpen === instrument && (
                    <div className="mt-2 space-y-2 border-t border-neutral-800 pt-2">
                      {instrumentHistory.map((h) => (
                        <div key={h.week_of} className="rounded bg-neutral-950 p-2 text-xs">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-medium text-neutral-300">
                              Week {weekNumber[h.week_of]}
                            </span>
                            <span className="text-neutral-600">({h.week_of})</span>
                            <span
                              className={
                                h.bias === "Bullish"
                                  ? "text-green-400"
                                  : h.bias === "Bearish"
                                  ? "text-red-400"
                                  : "text-neutral-400"
                              }
                            >
                              {h.bias}
                            </span>
                          </div>
                          {h.key_levels && (
                            <div className="text-neutral-500">Levels: {h.key_levels}</div>
                          )}
                          {h.notes && (
                            <p className="mt-1 whitespace-pre-wrap text-neutral-400">
                              {h.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
