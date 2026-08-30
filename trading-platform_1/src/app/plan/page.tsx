"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { WATCHLIST } from "@/lib/types";

type Plan = {
  id: string;
  name: string;
  style: string;
  markets: string[];
  sessions: string[];
  rules: Record<string, string>;
};

const SESSIONS = ["Asia", "London", "New York"];

export default function TradingPlanPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [style, setStyle] = useState("Swing");
  const [markets, setMarkets] = useState<string[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [rulesText, setRulesText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from("trading_plans").select("*");
    if (error) setError(error.message);
    else setPlans(data as Plan[]);
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(list: string[], setList: (v: string[]) => void, val: string) {
    setList(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in — see the sign-in note below.");
      return;
    }
    const { error } = await supabase.from("trading_plans").insert({
      user_id: user.id,
      name,
      style,
      markets,
      sessions,
      rules: { free_text: rulesText },
    });
    if (error) setError(error.message);
    else {
      setName("");
      setRulesText("");
      load();
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-medium">Trading plans</h1>

      <form onSubmit={save} className="space-y-3 rounded-lg border border-neutral-800 p-4">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          placeholder="Plan name, e.g. NY Session ICT Model"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        >
          <option>Intraday</option>
          <option>Swing</option>
          <option>Scalping</option>
        </select>

        <div>
          <div className="mb-1 text-xs text-neutral-500">Markets</div>
          <div className="flex flex-wrap gap-2">
            {WATCHLIST.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => toggle(markets, setMarkets, m)}
                className={`rounded px-2 py-1 text-xs ${
                  markets.includes(m) ? "bg-neutral-100 text-neutral-900" : "bg-neutral-800"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs text-neutral-500">Sessions</div>
          <div className="flex flex-wrap gap-2">
            {SESSIONS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => toggle(sessions, setSessions, s)}
                className={`rounded px-2 py-1 text-xs ${
                  sessions.includes(s) ? "bg-neutral-100 text-neutral-900" : "bg-neutral-800"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <textarea
          placeholder="Setup rules: HTF bias, entry model, stop rule, minimum R, news filter…"
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          rows={4}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
        >
          Save plan
        </button>
      </form>

      <section className="space-y-3">
        {plans.map((p) => (
          <div key={p.id} className="rounded-lg border border-neutral-800 p-4">
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-neutral-500">
              {p.style} · {p.markets?.join(", ")} · {p.sessions?.join(", ")}
            </div>
            {p.rules?.free_text && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-300">
                {p.rules.free_text}
              </p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
