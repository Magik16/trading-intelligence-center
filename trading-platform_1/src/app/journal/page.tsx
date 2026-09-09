"use client";
import { useEffect, useState } from "react";
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
  setup_tag: "",
  followed_plan: true,
  chart_h4: "",
  chart_15m: "",
};

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
      setup_tag: e.setup_tag ?? "",
      followed_plan: e.followed_plan,
      chart_h4: e.chart_h4 ?? "",
      chart_15m: e.chart_15m ?? "",
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
      setup_tag: form.setup_tag || null,
      followed_plan: form.followed_plan,
      chart_h4: form.chart_h4 || null,
      chart_15m: form.chart_15m || null,
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

  const winCount = entries.filter((e) => (e.result_r ?? 0) > 0).length;
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
            placeholder="Setup tag"
            value={form.setup_tag}
            onChange={(e) => setForm({ ...form, setup_tag: e.target.value })}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
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
          <div className="grid gap-2 sm:grid-cols-2">
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
                <th className="py-2">Instrument</th>
                <th>Dir</th>
                <th>Setup</th>
                <th>Risk ($)</th>
                <th>R</th>
                <th>Plan?</th>
                <th>Charts</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const hasCharts = e.chart_h4 || e.chart_15m;
                return (
                  <>
                    <tr
                      key={e.id}
                      className={`border-t border-neutral-800 ${
                        editingId === e.id ? "bg-neutral-900" : ""
                      }`}
                    >
                      <td className="py-2">{e.instrument}</td>
                      <td>{e.direction}</td>
                      <td>{e.setup_tag ?? "—"}</td>
                      <td>{e.risk_usd != null ? `$${e.risk_usd}` : "—"}</td>
                      <td className={e.result_r && e.result_r > 0 ? "text-green-400" : "text-red-400"}>
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
                        <td colSpan={8} className="py-2">
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
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
