"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { WATCHLIST } from "@/lib/types";

type WeeklyEntry = {
  instrument: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  key_levels: string;
  notes: string;
  chart_h4: string;
  chart_15m: string;
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
  d.setHours(12, 0, 0, 0); // noon, so evening hours never roll the date over in UTC
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

type Price =
  | { available: false; reason: string }
  | {
      available: true;
      weekOpen: number;
      latest: number;
      latestDate: string;
      high: number;
      low: number;
      prevWeekClose: number | null;
      changePct: number;
      daily?: { date: string; open: number; high: number; low: number; close: number }[];
    };

function fmt(instrument: string, n: number): string {
  const d = instrument === "EUR/USD" || instrument === "GBP/USD" ? 5 : instrument === "DXY" ? 3 : 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function PriceLine({ instrument, price }: { instrument: string; price?: Price }) {
  if (!price) return <p className="mb-2 text-xs text-neutral-600">Loading price…</p>;
  if (!price.available)
    return <p className="mb-2 text-xs text-neutral-600">Price: unavailable ({price.reason})</p>;
  const up = price.changePct >= 0;
  return (
    <p className="mb-2 text-xs text-neutral-400">
      <span className="text-neutral-200">{fmt(instrument, price.latest)}</span> (close {price.latestDate}) · week open{" "}
      {fmt(instrument, price.weekOpen)} · high {fmt(instrument, price.high)} · low {fmt(instrument, price.low)} ·{" "}
      <span className={up ? "text-green-400" : "text-red-400"}>
        {up ? "+" : ""}
        {price.changePct.toFixed(2)}%
      </span>
    </p>
  );
}


// ICT reference levels computed from the daily candles (no intraday data).
function ictLines(instrument: string, p: Price | undefined, weekOf: string): string[] {
  if (!p || !p.available || !p.daily || p.daily.length === 0) return ["(daily candles unavailable)"];
  const d = p.daily;
  const prior = d.filter((c) => c.date < weekOf);
  const cur = d.filter((c) => c.date >= weekOf);
  const lines: string[] = [];
  for (const c of d)
    lines.push(`${c.date} ${c.date < weekOf ? "(prior week)" : "(this week)"} | open ${fmt(instrument, c.open)} | high ${fmt(instrument, c.high)} | low ${fmt(instrument, c.low)} | close ${fmt(instrument, c.close)}`);
  if (prior.length > 0) {
    const pwh = Math.max(...prior.map((c) => c.high));
    const pwl = Math.min(...prior.map((c) => c.low));
    lines.push(`Prior week high (PWH) ${fmt(instrument, pwh)} | prior week low (PWL) ${fmt(instrument, pwl)} | prior week equilibrium ${fmt(instrument, (pwh + pwl) / 2)}`);
    lines.push(
      `This week's high ${fmt(instrument, p.high)} is ${p.high > pwh ? "ABOVE" : "below"} PWH (buy-side liquidity ${p.high > pwh ? "swept" : "not yet taken"}); this week's low ${fmt(instrument, p.low)} is ${p.low < pwl ? "BELOW" : "above"} PWL (sell-side liquidity ${p.low < pwl ? "swept" : "not yet taken"}).`
    );
  }
  const mid = (p.high + p.low) / 2;
  const pos = p.high > p.low ? ((p.latest - p.low) / (p.high - p.low)) * 100 : 50;
  lines.push(
    `Weekly range so far: low ${fmt(instrument, p.low)} to high ${fmt(instrument, p.high)} | equilibrium (50%) ${fmt(instrument, mid)} | latest close ${fmt(instrument, p.latest)} sits at ${pos.toFixed(0)}% of the range (${pos > 50 ? "premium" : pos < 50 ? "discount" : "at equilibrium"}).`
  );
  lines.push(`Latest close is ${p.latest > p.weekOpen ? "ABOVE" : "BELOW"} the weekly open ${fmt(instrument, p.weekOpen)}.`);
  if (cur.length >= 2) {
    const pd = cur[cur.length - 2];
    lines.push(`Previous day (${pd.date}) high (PDH) ${fmt(instrument, pd.high)} | low (PDL) ${fmt(instrument, pd.low)}.`);
  }
  return lines;
}

function emptyWeekly(): Record<string, WeeklyEntry> {
  return Object.fromEntries(
    WATCHLIST.map((w) => [w, { instrument: w, bias: "Neutral" as const, key_levels: "", notes: "", chart_h4: "", chart_15m: "" }])
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
  type AiResult = { loading: boolean; text?: string; error?: string; charts?: string[] };
  const [results, setResults] = useState<Record<string, AiResult>>({});
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const anyLoading = Object.values(results).some((r) => r.loading);
  const [prices, setPrices] = useState<Record<string, Price> | null>(null);

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
      setResults({});
      supabase
        .from("weekly_bias")
        .select("*")
        .eq("week_of", week)
        .then(({ data, error }) => {
          if (error) return;
          if (data && data.length > 0) {
            setWeekly((prev) => {
              const next = { ...prev };
              for (const row of data)
                next[row.instrument] = {
                  ...row,
                  key_levels: row.key_levels ?? "",
                  notes: row.notes ?? "",
                  chart_h4: row.chart_h4 ?? "",
                  chart_15m: row.chart_15m ?? "",
                };
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

  // Real prices for the selected week (never estimated; shows "unavailable" if the source fails).
  useEffect(() => {
    if (!weekOf) return;
    let cancelled = false;
    setPrices(null);
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch("/api/week-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ weekOf }),
        });
        const data = await res.json();
        if (!cancelled && data.prices) setPrices(data.prices);
      } catch {
        /* leave as loading/unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekOf, supabase]);

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
      chart_h4: e.chart_h4 || null,
      chart_15m: e.chart_15m || null,
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

  // Shared context for the selected week: real prices, calendar (current week only), outlook, plan.
  async function buildContext(): Promise<string> {
    const isCurrent = weekOf === mondayOf(new Date());
    const monthLabel = months.find((m) => m.value === selectedMonth)?.label ?? selectedMonth;
    const lines: string[] = [];
    lines.push(`== REAL PRICES FOR THE WEEK OF ${weekOf} (daily data, Yahoo Finance; only prices in this section are real) ==`);
    for (const w of WATCHLIST) {
      const p = prices?.[w];
      if (!p) lines.push(`${w}: price not loaded`);
      else if (!p.available) lines.push(`${w}: price unavailable (${p.reason})`);
      else
        lines.push(
          `${w}: week open ${fmt(w, p.weekOpen)} | latest close ${fmt(w, p.latest)} on ${p.latestDate} | week high ${fmt(w, p.high)} | week low ${fmt(w, p.low)} | prior week close ${p.prevWeekClose == null ? "n/a" : fmt(w, p.prevWeekClose)} | change ${p.changePct.toFixed(2)}%`
        );
    }
    lines.push("", `== TRADER'S MONTHLY OUTLOOK (${monthLabel}) ==`);
    for (const w of WATCHLIST) {
      const m = monthly[w];
      const empty = m.bias === "Neutral" && !m.notes.trim();
      lines.push(empty ? `${w}: nothing entered` : `${w}: ${m.bias} | ${m.notes || "no notes"}`);
    }
    lines.push("", "== ECONOMIC CALENDAR (USD, EUR, GBP; high and medium impact) ==");
    if (!isCurrent) {
      lines.push(`Calendar data is only available for the current week, not for the week of ${weekOf}. Do not mention any events.`);
    } else {
      try {
        const cal = await fetch("/api/calendar").then((r) => r.json());
        type Ev = { title: string; country: string; date: string; impact: string; forecast: string | null; previous: string | null };
        const events = ((cal.events ?? []) as Ev[])
          .filter((e) => ["USD", "EUR", "GBP"].includes(e.country))
          .filter((e) => ["high", "medium"].includes((e.impact ?? "").toLowerCase()))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 60);
        if (events.length === 0) lines.push("(no events)");
        for (const e of events) {
          lines.push(`${new Date(e.date).toLocaleString()} | ${e.country} | ${e.impact} | ${e.title} | previous ${e.previous || "-"} | forecast ${e.forecast || "-"}`);
        }
      } catch {
        lines.push("(calendar unavailable)");
      }
    }
    const { data: plans } = await supabase.from("trading_plans").select("name,style,markets,sessions,rules").limit(3);
    lines.push("", "== TRADER'S TRADING PLAN ==");
    if (!plans || plans.length === 0) lines.push("No trading plan entered.");
    else for (const p of plans) lines.push(JSON.stringify(p).slice(0, 1500));
    return lines.join("\n");
  }

  async function runOne(instrument: string, context: string, token: string, forWeek: string) {
    setResults((r) => ({ ...r, [instrument]: { loading: true } }));
    const e = weekly[instrument];
    const entered = e.bias !== "Neutral";
    const own = entered
      ? `== TRADER'S OWN ENTRY FOR ${instrument} (week of ${forWeek}) ==\nbias: ${e.bias}`
      : `== TRADER'S OWN ENTRY FOR ${instrument} (week of ${forWeek}) ==\nThe trader entered no bias for this instrument (left on Neutral).`;
    const levels = `== DAILY CANDLES AND KEY LEVELS FOR ${instrument} (computed from daily data; no intraday data) ==\n${ictLines(instrument, prices?.[instrument], forWeek).join("\n")}`;
    try {
      const res = await fetch("/api/weekly-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          weekOf: forWeek,
          instrument,
          pack: `${own}\n\n${levels}\n\n${context}`,
          charts: [
            { label: "H4", url: e.chart_h4 },
            { label: "15m", url: e.chart_15m },
          ],
        }),
      });
      const data = await res.json();
      setResults((r) => ({
        ...r,
        [instrument]: data.error ? { loading: false, error: data.error } : { loading: false, text: data.text, charts: data.charts },
      }));
    } catch {
      setResults((r) => ({ ...r, [instrument]: { loading: false, error: "Failed to generate." } }));
    }
  }

  async function generate(only?: string) {
    setSummaryError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSummaryError("You need to be signed in.");
      return;
    }
    const targets = only ? [only] : [...WATCHLIST];
    setResults((r) => {
      const next = { ...r };
      for (const t of targets) next[t] = { loading: true };
      return next;
    });
    const context = await buildContext();
    await Promise.all(targets.map((t) => runOne(t, context, session.access_token, weekOf)));
  }

  function parseResult(text: string) {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^(BIAS|SUGGESTION|APPROACH|CAREFUL):\s*(.*)$/);
        return m ? { label: m[1], text: m[2] } : { label: "", text: l };
      });
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
              <PriceLine instrument={instrument} price={prices?.[instrument]} />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0 rounded-full bg-white/10 py-1 text-center text-xs font-medium text-neutral-200">H4</span>
                  <input
                    placeholder="TradingView share link"
                    value={e.chart_h4}
                    onChange={(ev) => updateWeekly(instrument, "chart_h4", ev.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0 rounded-full bg-white/10 py-1 text-center text-xs font-medium text-neutral-200">15min</span>
                  <input
                    placeholder="TradingView share link"
                    value={e.chart_15m}
                    onChange={(ev) => updateWeekly(instrument, "chart_15m", ev.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="mt-3 rounded border border-neutral-800 bg-neutral-900 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-400">
                    AI: for the week of {weekOf}, how should I trade {instrument}?
                  </span>
                  <button
                    onClick={() => generate(instrument)}
                    disabled={anyLoading}
                    className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 disabled:opacity-50"
                  >
                    {results[instrument]?.loading ? "Generating…" : results[instrument] ? "Redo" : "Ask AI"}
                  </button>
                </div>
                {results[instrument]?.loading && <p className="text-sm text-neutral-500">Reading price and charts…</p>}
                {results[instrument]?.error && <p className="text-sm text-amber-300">{results[instrument]?.error}</p>}
                {results[instrument]?.text && (
                  <div className="space-y-3">
                    {parseResult(results[instrument]!.text!).map((l, i) => {
                      const tone =
                        l.label === "BIAS"
                          ? { bar: "border-yellow-400", label: "text-yellow-400" }
                          : l.label === "SUGGESTION"
                          ? { bar: "border-green-400", label: "text-green-400" }
                          : l.label === "APPROACH"
                          ? { bar: "border-orange-400", label: "text-orange-400" }
                          : l.label === "CAREFUL"
                          ? { bar: "border-red-400", label: "text-red-400" }
                          : { bar: "border-neutral-700", label: "text-neutral-500" };
                      return (
                        <div key={i} className={`border-l-2 pl-3 ${tone.bar}`}>
                          {l.label && (
                            <div className={`mb-0.5 text-[11px] font-semibold uppercase tracking-wider ${tone.label}`}>
                              {l.label}
                            </div>
                          )}
                          <p className="text-sm leading-relaxed text-neutral-200">{l.text}</p>
                        </div>
                      );
                    })}
                    {results[instrument]?.charts?.some((c) => c.includes("NOT loaded")) && (
                      <p className="text-xs text-amber-400">
                        {results[instrument]!.charts!.filter((c) => c.includes("NOT loaded")).join(" · ")}
                      </p>
                    )}
                  </div>
                )}
                {!results[instrument] && (
                  <p className="text-xs text-neutral-600">Click “Generate AI summary” or “Ask AI” for this pair.</p>
                )}
              </div>
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
          onClick={() => generate()}
          disabled={anyLoading}
          className="rounded border border-neutral-700 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {anyLoading ? "Generating…" : "Generate AI summary"}
        </button>
      </div>

      {summaryError && (
        <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">
          {summaryError}
        </div>
      )}

    </div>
  );
}
