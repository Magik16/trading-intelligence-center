"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { WATCHLIST } from "@/lib/types";

type WeeklyEntry = {
  instrument: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  key_levels: string;
  notes: string;
};

type MonthlyEntry = {
  instrument: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  notes: string;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Generates a fixed run of months starting Sept 2026, twelve months long.
function generateMonths(): { value: string; label: string }[] {
  const months = [];
  let year = 2026;
  let month = 9; // September, 1-indexed
  for (let i = 0; i < 12; i++) {
    const value = `${year}-${String(month).padStart(2, "0")}`;
    months.push({ value, label: `${MONTH_NAMES[month - 1]} ${year}` });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return months;
}

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

// Returns the Monday-based week-start dates for every week that touches
// the given month, in order — becomes "Week 1", "Week 2", etc.
function weeksInMonth(monthValue: string): string[] {
  const [year, month] = monthValue.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const mondays = new Set<string>();
  for (let day = 1; day <= daysInMonth; day++) {
    mondays.add(mondayOf(new Date(year, month - 1, day)));
  }
  return Array.from(mondays).sort();
}

function emptyWeekly(): Record<string, WeeklyEntry> {
  return Object.fromEntries(
    WATCHLIST.map((w) => [w, { instrument: w, bias: "Neutral" as const, key_levels: "", notes: "" }])
  );
}

function emptyMonthly(): Record<string, MonthlyEntry> {
  return Object.fromEntries(
    WATCHLIST.map((w) => [w, { instrument: w, bias: "Neutral" as const, notes: "" }])
  );
}

export default function WeeklyBiasPage() {
  const supabase = createClient();
  const months = useMemo(() => generateMonths(), []);
  const currentMonthValue = mondayOf(new Date()).slice(0, 7);
  const defaultMonth = months.find((m) => m.value === currentMonthValue)?.value ?? months[0].value;

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [weekOptions, setWeekOptions] = useState<string[]>(weeksInMonth(defaultMonth));
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);

  const [weekly, setWeekly] = useState<Record<string, WeeklyEntry>>(emptyWeekly());
  const [monthly, setMonthly] = useState<Record<string, MonthlyEntry>>(emptyMonthly());
  const [monthlyOpen, setMonthlyOpen] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [savingWeek, setSavingWeek] = useState(false);
  const [savingMonth, setSavingMonth] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // When month changes, recompute its weeks and jump to the week containing
  // today if this is the current month, else Week 1.
  useEffect(() => {
    const weeks = weeksInMonth(selectedMonth);
    setWeekOptions(weeks);
    const todayMonday = mondayOf(new Date());
    const idx = weeks.indexOf(todayMonday);
    setSelectedWeekIdx(idx >= 0 ? idx : 0);
  }, [selectedMonth]);

  const weekOf = weekOptions[selectedWeekIdx] ?? weekOptions[0];

  const loadWeek = useCallback(
    (week: string) => {
      if (!week) return;
      setWeekly(emptyWeekly());
      setSummary(null);
      supabase
        .from("weekly_bias")
        .select("*")
        .eq("week_of", week)
        .then(({ data, error }) => {
          if (error) return;
          if (data && data.length > 0) {
            setWeekly((prev) => {
              const next = { ...prev };
              for (const row of data) next[row.instrument] = row;
              return next;
            });
          }
        });
    },
    [supabase]
  );

  const loadMonth = useCallback(
    (month: string) => {
      setMonthly(emptyMonthly());
      supabase
        .from("monthly_bias")
        .select("*")
        .eq("month", month)
        .then(({ data, error }) => {
          if (error) return;
          if (data && data.length > 0) {
            setMonthly((prev) => {
              const next = { ...prev };
              for (const row of data) next[row.instrument] = row;
              return next;
            });
          }
        });
    },
    [supabase]
  );

  useEffect(() => {
    loadWeek(weekOf);
  }, [weekOf, loadWeek]);

  useEffect(() => {
    loadMonth(selectedMonth);
  }, [selectedMonth, loadMonth]);

  function updateWeekly(instrument: string, field: keyof WeeklyEntry, value: string) {
    setWeekly((prev) => ({ ...prev, [instrument]: { ...prev[instrument], [field]: value } }));
  }

  function updateMonthly(instrument: string, field: keyof MonthlyEntry, value: string) {
    setMonthly((prev) => ({ ...prev, [instrument]: { ...prev[instrument], [field]: value } }));
  }

  async function saveWeek() {
    setSavingWeek(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in to save.");
      setSavingWeek(false);
      return;
    }
    const rows = Object.values(weekly).map((e) => ({
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
    setSavingWeek(false);
  }

  async function saveMonth() {
    setSavingMonth(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in to save.");
      setSavingMonth(false);
      return;
    }
    const rows = Object.values(monthly).map((e) => ({
      user_id: user.id,
      month: selectedMonth,
      instrument: e.instrument,
      bias: e.bias,
      notes: e.notes,
    }));
    const { error } = await supabase
      .from("monthly_bias")
      .upsert(rows, { onConflict: "user_id,month,instrument" });
    if (error) setError(error.message);
    setSavingMonth(false);
  }

  async function generateSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/weekly-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekOf, entries: Object.values(weekly) }),
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
        <p className="text-sm text-neutral-500">Monthly outlook, then weekly updates.</p>
      </div>

      {/* Month tabs */}
      <div className="flex flex-wrap gap-1 border-b border-neutral-800 pb-2">
        {months.map((m) => (
          <button
            key={m.value}
            onClick={() => setSelectedMonth(m.value)}
            className={`rounded px-3 py-1.5 text-sm ${
              selectedMonth === m.value
                ? "bg-neutral-800 text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Monthly outlook section */}
      <section className="rounded-lg border border-neutral-800">
        <button
          onClick={() => setMonthlyOpen(!monthlyOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="font-medium">
            Monthly outlook — {months.find((m) => m.value === selectedMonth)?.label}
          </span>
          <span className="text-neutral-500">{monthlyOpen ? "−" : "+"}</span>
        </button>
        {monthlyOpen && (
          <div className="space-y-3 border-t border-neutral-800 p-4">
            {WATCHLIST.map((instrument) => {
              const m = monthly[instrument];
              return (
                <div key={instrument} className="rounded border border-neutral-800 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{instrument}</span>
                    <select
                      value={m.bias}
                      onChange={(ev) => updateMonthly(instrument, "bias", ev.target.value)}
                      className={`rounded px-2 py-1 text-xs ${
                        m.bias === "Bullish"
                          ? "bg-green-900 text-green-300"
                          : m.bias === "Bearish"
                          ? "bg-red-900 text-red-300"
                          : "bg-neutral-800 text-neutral-300"
                      }`}
                    >
                      <option>Bullish</option>
                      <option>Bearish</option>
                      <option>Neutral</option>
                    </select>
                  </div>
                  <textarea
                    placeholder="Big-picture outlook for the month — expected range, main driver, why it's uncertain"
                    value={m.notes}
                    onChange={(ev) => updateMonthly(instrument, "notes", ev.target.value)}
                    rows={3}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
                  />
                </div>
              );
            })}
            <button
              onClick={saveMonth}
              disabled={savingMonth}
              className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
            >
              {savingMonth ? "Saving…" : "Save monthly outlook"}
            </button>
          </div>
        )}
      </section>

      {/* Week sub-tabs */}
      <div className="flex flex-wrap gap-1">
        {weekOptions.map((w, idx) => (
          <button
            key={w}
            onClick={() => setSelectedWeekIdx(idx)}
            className={`rounded px-3 py-1.5 text-sm ${
              selectedWeekIdx === idx
                ? "bg-neutral-800 text-white"
                : "border border-neutral-700 text-neutral-400 hover:text-white"
            }`}
          >
            Week {idx + 1}
          </button>
        ))}
      </div>
      <p className="-mt-4 text-xs text-neutral-600">Week of {weekOf}</p>

      <div className="space-y-3">
        {WATCHLIST.map((instrument) => {
          const e = weekly[instrument];
          return (
            <div key={instrument} className="rounded-lg border border-neutral-800 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{instrument}</span>
                <select
                  value={e.bias}
                  onChange={(ev) => updateWeekly(instrument, "bias", ev.target.value)}
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
                onChange={(ev) => updateWeekly(instrument, "key_levels", ev.target.value)}
                className="mb-2 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
              />
              <textarea
                placeholder="This week's notes — structure, plan, what would invalidate it"
                value={e.notes}
                onChange={(ev) => updateWeekly(instrument, "notes", ev.target.value)}
                rows={6}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={saveWeek}
          disabled={savingWeek}
          className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {savingWeek ? "Saving…" : `Save Week ${selectedWeekIdx + 1}`}
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
            AI summary of this week
          </h2>
          <p className="whitespace-pre-wrap text-sm text-neutral-200">{summary}</p>
        </div>
      )}
    </div>
  );
}
