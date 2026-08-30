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
  result_r: number | null;
  setup_tag: string | null;
  followed_plan: boolean;
  traded_at: string;
};

export default function Journal() {
  const supabase = createClient();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    instrument: WATCHLIST[0],
    direction: "long",
    entry: "",
    stop: "",
    target: "",
    result_r: "",
    setup_tag: "",
    followed_plan: true,
  });
  const [error, setError] = useState<string | null>(null);

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

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in — see the sign-in note below.");
      return;
    }
    const { error } = await supabase.from("journal_entries").insert({
      user_id: user.id,
      instrument: form.instrument,
      direction: form.direction,
      entry: parseFloat(form.entry) || null,
      stop: parseFloat(form.stop) || null,
      target: parseFloat(form.target) || null,
      result_r: parseFloat(form.result_r) || null,
      setup_tag: form.setup_tag || null,
      followed_plan: form.followed_plan,
    });
    if (error) setError(error.message);
    else load();
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

      <form onSubmit={addEntry} className="space-y-3 rounded-lg border border-neutral-800 p-4">
        <h2 className="text-sm font-medium text-neutral-400">Log a trade</h2>
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
        <button
          type="submit"
          className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
        >
          Add entry
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
                <th>R</th>
                <th>Plan?</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-neutral-800">
                  <td className="py-2">{e.instrument}</td>
                  <td>{e.direction}</td>
                  <td>{e.setup_tag ?? "—"}</td>
                  <td className={e.result_r && e.result_r > 0 ? "text-green-400" : "text-red-400"}>
                    {e.result_r ?? "—"}
                  </td>
                  <td>{e.followed_plan ? "Yes" : "No"}</td>
                </tr>
              ))}
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
