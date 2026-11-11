"use client";
import { Fragment, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { WATCHLIST } from "@/lib/types";

type Entry = {
  id: string;
  instrument: string;
  direction: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  risk_usd: number | null;
  result_r: number | null;
  setup_tag: string | null;
  followed_plan: boolean;
  chart_h4: string | null;
  chart_15m: string | null;
  chart_result: string | null;
  outcome: string | null;
  traded_at: string;
};

const emptyForm = {
  instrument: WATCHLIST[0],
  direction: "long",
  entry: "",
  stop: "",
  target: "",
  risk_usd: "",
  result_r: "",
  followed_plan: true,
  traded_on: "",
  chart_h4: "",
  chart_15m: "",
  chart_result: "",
  outcome: "",
};

const OUTCOMES = [
  { key: "win", label: "Win", active: "border-green-400 bg-green-400/15 text-green-400", text: "text-green-400", color: "#4ade80" },
  { key: "loss", label: "Loss", active: "border-red-400 bg-red-400/15 text-red-400", text: "text-red-400", color: "#f87171" },
  { key: "breakeven", label: "Breakeven", active: "border-yellow-400 bg-yellow-400/15 text-yellow-400", text: "text-yellow-400", color: "#facc15" },
];

// Uses the chosen outcome; falls back to the R result for older trades.
function outcomeOf(e: Entry) {
  if (e.outcome) return OUTCOMES.find((o) => o.key === e.outcome) ?? null;
  if (e.result_r == null) return null;
  return OUTCOMES[e.result_r > 0 ? 0 : e.result_r < 0 ? 1 : 2];
}

function localDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

// Monday of the week the trade was taken (same logic as Weekly bias).
function mondayOf(iso: string): string {
  const d = new Date(iso);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d.toLocaleDateString("en-CA");
}

function weekStats(list: Entry[]) {
  const marked = list.filter((e) => outcomeOf(e));
  const n = marked.length;
  const count = (k: string) => marked.filter((e) => outcomeOf(e)?.key === k).length;
  const pct = (c: number) => (n > 0 ? Math.round((c / n) * 100) : 0);
  const wins = count("win");
  const losses = count("loss");
  const be = count("breakeven");
  return {
    trades: list.length,
    wins,
    losses,
    be,
    winPct: pct(wins),
    lossPct: pct(losses),
    bePct: pct(be),
    netR: list.reduce((s, e) => s + (e.result_r ?? 0), 0),
    planPct: list.length ? Math.round((list.filter((e) => e.followed_plan).length / list.length) * 100) : 0,
    offPlanLosses: list.filter((e) => !e.followed_plan && outcomeOf(e)?.key === "loss").length,
  };
}

function weekLabel(monday: string): string {
  const a = new Date(`${monday}T12:00:00`);
  const b = new Date(a);
  b.setDate(b.getDate() + 4);
  const f = (d: Date) => d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${f(a)} – ${f(b)}`;
}

export default function Journal() {
  const supabase = createClient();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [chartsOpen, setChartsOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("journal_entries")
      .select("*")
      .order("traded_at", { ascending: false });
    if (error) setError(error.message);
    else setEntries(data as Entry[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(e: Entry) {
    setEditingId(e.id);
    setForm({
      instrument: e.instrument,
      direction: e.direction,
      entry: e.entry?.toString() ?? "",
      stop: e.stop?.toString() ?? "",
      target: e.target?.toString() ?? "",
      risk_usd: e.risk_usd?.toString() ?? "",
      result_r: e.result_r?.toString() ?? "",
      followed_plan: e.followed_plan,
      traded_on: localDate(e.traded_at),
      chart_h4: e.chart_h4 ?? "",
      chart_15m: e.chart_15m ?? "",
      chart_result: e.chart_result ?? "",
      outcome: e.outcome ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this trade entry? This can't be undone.")) return;
    const { error } = await supabase.from("journal_entries").delete().eq("id", id);
    if (error) setError(error.message);
    else {
      if (editingId === id) cancelEdit();
      load();
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in — see the sign-in note below.");
      return;
    }
    const payload = {
      instrument: form.instrument,
      direction: form.direction,
      entry: parseFloat(form.entry) || null,
      stop: parseFloat(form.stop) || null,
      target: parseFloat(form.target) || null,
      risk_usd: parseFloat(form.risk_usd) || null,
      result_r: parseFloat(form.result_r) || null,
      followed_plan: form.followed_plan,
      traded_at: form.traded_on
        ? new Date(`${form.traded_on}T12:00:00`).toISOString()
        : new Date().toISOString(),
      chart_h4: form.chart_h4 || null,
      chart_15m: form.chart_15m || null,
      chart_result: form.chart_result || null,
      outcome: form.outcome || null,
    };

    if (editingId) {
      const { error } = await supabase
        .from("journal_entries")
        .update(payload)
        .eq("id", editingId);
      if (error) setError(error.message);
      else {
        cancelEdit();
        load();
      }
    } else {
      const { error } = await supabase
        .from("journal_entries")
        .insert({ user_id: user.id, ...payload });
      if (error) setError(error.message);
      else {
        setForm(emptyForm);
        load();
      }
    }
  }

  const thisMonday = mondayOf(new Date().toISOString());
  const weeks = Array.from(
    entries.reduce((m, e) => {
      const k = mondayOf(e.traded_at);
      m.set(k, [...(m.get(k) ?? []), e]);
      return m;
    }, new Map<string, Entry[]>())
  ).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const winCount = entries.filter((e) => outcomeOf(e)?.key === "win").length;
  const total = entries.length;
  const winRate = total > 0 ? ((winCount / total) * 100).toFixed(1) : "—";
  const avgR =
    total > 0
      ? (
          entries.reduce((s, e) => s + (e.result_r ?? 0), 0) / total
        ).toFixed(2)
      : "—";

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-medium">Trading journal</h1>

      <section className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-4">
        <Stat label="Trades logged" value={String(total)} />
        <Stat label="Win rate" value={`${winRate}%`} />
        <Stat label="Average R" value={String(avgR)} />
        <Stat
          label="Plan compliance"
          value={
            total > 0
              ? `${((entries.filter((e) => e.followed_plan).length / total) * 100).toFixed(0)}%`
              : "—"
          }
        />
      </section>

      <form onSubmit={submitForm} className="space-y-3 rounded-lg border border-neutral-800 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-400">
            {editingId ? "Edit trade" : "Log a trade"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              Cancel edit
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <select
            value={form.instrument}
            onChange={(e) => setForm({ ...form, instrument: e.target.value })}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          >
            {WATCHLIST.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
          <select
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          >
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
          <input
            placeholder="Entry"
            value={form.entry}
            onChange={(e) => setForm({ ...form, entry: e.target.value })}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <input
            placeholder="Stop"
            value={form.stop}
            onChange={(e) => setForm({ ...form, stop: e.target.value })}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <input
            placeholder="Target"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <input
            placeholder="Risk ($) — dollar amount at risk"
            value={form.risk_usd}
            onChange={(e) => setForm({ ...form, risk_usd: e.target.value })}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <input
            placeholder="Result (R)"
            value={form.result_r}
            onChange={(e) => setForm({ ...form, result_r: e.target.value })}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            Trade date
            <input
              type="date"
              value={form.traded_on || localDate(new Date().toISOString())}
              onChange={(e) => setForm({ ...form, traded_on: e.target.value })}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-center gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setForm({ ...form, outcome: form.outcome === o.key ? "" : o.key })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  form.outcome === o.key ? o.active : "border-neutral-700 text-neutral-400"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={form.followed_plan}
              onChange={(e) => setForm({ ...form, followed_plan: e.target.checked })}
            />
            Followed plan
          </label>
        </div>

        <div className="rounded border border-neutral-800 p-3">
          <p className="mb-2 text-xs text-neutral-500">
            Chart links — paste your TradingView (or any) share links, same as your spreadsheet
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              placeholder="H4 chart link"
              value={form.chart_h4}
              onChange={(e) => setForm({ ...form, chart_h4: e.target.value })}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
            />
            <input
              placeholder="15min chart link"
              value={form.chart_15m}
              onChange={(e) => setForm({ ...form, chart_15m: e.target.value })}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
            />
            <input
              placeholder="Result chart link (win / loss)"
              value={form.chart_result}
              onChange={(e) => setForm({ ...form, chart_result: e.target.value })}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
        >
          {editingId ? "Update entry" : "Add entry"}
        </button>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-400">History</h2>
        {loading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-neutral-500">No trades logged yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-2 pl-3">Week</th>
                <th>Instrument</th>
                <th>Dir</th>
                <th>Risk ($)</th>
                <th>Result</th>
                <th>R</th>
                <th>Plan?</th>
                <th>Charts</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {weeks.map(([monday, list]) => {
                const st = weekStats(list);
                const closed = monday < thisMonday;
                return (
                  <Fragment key={monday}>
                    <tr className="border-t-2 border-neutral-700 bg-neutral-900">
                      <td colSpan={9} className="px-1 py-3">
                        <div className="flex items-stretch gap-3">
                          {st.trades > 0 ? (
                            <div className="flex w-1.5 shrink-0 flex-col overflow-hidden rounded-full bg-neutral-800">
                              <div className="bg-green-400" style={{ height: `${st.winPct}%` }} />
                              <div className="bg-yellow-400" style={{ height: `${st.bePct}%` }} />
                              <div className="bg-red-400" style={{ height: `${st.lossPct}%` }} />
                            </div>
                          ) : (
                            <div className="w-1.5 shrink-0 rounded-full bg-neutral-800" />
                          )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="font-medium">Week of {weekLabel(monday)}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${closed ? "border-neutral-600 text-neutral-400" : "border-blue-400 text-blue-400"}`}>
                            {closed ? "Week closed" : "In progress"}
                          </span>
                          <span className="text-xs text-neutral-400">{st.trades} trade{st.trades === 1 ? "" : "s"}</span>
                          <span className="text-xs text-green-400">Win {st.winPct}%</span>
                          <span className="text-xs text-red-400">Loss {st.lossPct}%</span>
                          <span className="text-xs text-yellow-400">Breakeven {st.bePct}%</span>
                          <span className="text-xs text-neutral-300">Net {st.netR > 0 ? "+" : ""}{st.netR.toFixed(2)}R</span>
                          <span className="text-xs text-neutral-400">Plan followed {st.planPct}%</span>
                          {st.offPlanLosses > 0 && (
                            <span className="text-xs text-red-400">{st.offPlanLosses} loss{st.offPlanLosses === 1 ? "" : "es"} off-plan</span>
                          )}
                        </div>
                        </div>
                      </td>
                    </tr>
                    {list.map((e) => {
                const hasCharts = e.chart_h4 || e.chart_15m || e.chart_result;
                return (
                  <Fragment key={e.id}>
                    <tr
                      className={`border-t border-neutral-800 ${
                        editingId === e.id ? "bg-neutral-900" : ""
                      }`}
                    >
                      <td className="py-2 pl-3 text-xs text-neutral-400" style={{ borderLeft: `4px solid ${outcomeOf(e)?.color ?? "#404040"}` }}>{weekLabel(monday)}</td>
                      <td>{e.instrument}<span className="ml-2 text-xs text-neutral-500">{new Date(e.traded_at).toLocaleDateString([], { weekday: "short", day: "numeric" })}</span></td>
                      <td>{e.direction}</td>
                      <td>{e.risk_usd != null ? `$${e.risk_usd}` : "—"}</td>
                      <td>
                        {outcomeOf(e) ? (
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${outcomeOf(e)!.active}`}>
                            {outcomeOf(e)!.label}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={outcomeOf(e)?.text ?? "text-neutral-300"}>
                        {e.result_r ?? "—"}
                      </td>
                      <td>{e.followed_plan ? "Yes" : "No"}</td>
                      <td>
                        {hasCharts ? (
                          <button
                            onClick={() => setChartsOpen(chartsOpen === e.id ? null : e.id)}
                            className="text-xs text-neutral-500 hover:text-neutral-300"
                          >
                            {chartsOpen === e.id ? "Hide" : "View"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <button
                          onClick={() => startEdit(e)}
                          className="mr-3 text-xs text-blue-400 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteEntry(e.id)}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {chartsOpen === e.id && hasCharts && (
                      <tr className="border-t border-neutral-900 bg-neutral-950">
                        <td colSpan={9} className="py-2">
                          <div className="flex flex-wrap gap-3 text-xs">
                            {e.chart_h4 && (
                              <a href={e.chart_h4} target="_blank" className="text-blue-400 hover:underline">
                                H4
                              </a>
                            )}
                            {e.chart_15m && (
                              <a href={e.chart_15m} target="_blank" className="text-blue-400 hover:underline">
                                15min
                              </a>
                            )}
                            {e.chart_result && (
                              <a href={e.chart_result} target="_blank" className="text-blue-400 hover:underline">
                                Result
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}
