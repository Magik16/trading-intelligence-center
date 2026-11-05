"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { WATCHLIST } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string; hidden?: boolean };
type Price =
  | { available: false; reason: string }
  | { available: true; weekOpen: number; latest: number; latestDate: string; high: number; low: number; prevWeekClose: number | null; changePct: number };

function mondayOf(date: Date): string {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d.toISOString().slice(0, 10);
}

function recentWeeks(): string[] {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const out: string[] = [];
  for (let i = 1; i >= -6; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    out.push(mondayOf(d));
  }
  return out;
}

function fmt(instrument: string, n: number): string {
  const d = instrument === "EUR/USD" || instrument === "GBP/USD" ? 5 : instrument === "DXY" ? 3 : 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

const KICKOFF =
  "Start the session. In 4 short lines give your own read of this instrument for this week (what real price did, what my chart and notes show, whether they support my bias if I entered one). Then ask me for my position and reasoning.";

export default function ChatPage() {
  const supabase = createClient();
  const weeks = recentWeeks();
  const [weekOf, setWeekOf] = useState(mondayOf(new Date()));
  const [instrument, setInstrument] = useState<string>(WATCHLIST[0]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pack, setPack] = useState<string | null>(null);
  const [charts, setCharts] = useState<{ label: string; url: string }[]>([]);
  const [status, setStatus] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Changing pair or week starts a fresh conversation.
  useEffect(() => {
    setMessages([]);
    setPack(null);
    setError(null);
    setStatus("");
  }, [weekOf, instrument]);

  async function callChat(history: Msg[], context: string, chartLinks: { label: string; url: string }[], token: string) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        weekOf,
        instrument,
        pack: context,
        charts: chartLinks,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    return res.json();
  }

  async function buildPack(token: string) {
    const isCurrent = weekOf === mondayOf(new Date());
    const lines: string[] = [];

    const [{ data: entry }, { data: month }, { data: plans }] = await Promise.all([
      supabase.from("weekly_bias").select("*").eq("week_of", weekOf).eq("instrument", instrument).maybeSingle(),
      supabase.from("monthly_bias").select("*").eq("month", weekOf.slice(0, 7)).eq("instrument", instrument).maybeSingle(),
      supabase.from("trading_plans").select("name,style,markets,sessions,rules").limit(3),
    ]);

    lines.push(`== TRADER'S OWN ENTRY FOR ${instrument} (week of ${weekOf}) ==`);
    if (!entry || (!entry.notes && !entry.key_levels && entry.bias === "Neutral" && !entry.chart_h4 && !entry.chart_15m))
      lines.push("The trader entered nothing for this instrument this week.");
    else lines.push(`bias: ${entry.bias}`, `key levels: ${entry.key_levels || "none"}`, `notes: ${entry.notes || "none"}`);

    lines.push("", `== TRADER'S MONTHLY OUTLOOK (${weekOf.slice(0, 7)}) for ${instrument} ==`);
    lines.push(month && (month.notes || month.bias !== "Neutral") ? `${month.bias} | ${month.notes || "no notes"}` : "nothing entered");

    // Real prices
    lines.push("", `== REAL PRICES FOR THE WEEK OF ${weekOf} (daily data, Yahoo Finance; only prices in this section are real) ==`);
    try {
      const res = await fetch("/api/week-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ weekOf }),
      });
      const data = (await res.json()) as { prices?: Record<string, Price> };
      const order = [instrument, ...WATCHLIST.filter((w) => w !== instrument)];
      for (const w of order) {
        const p = data.prices?.[w];
        if (!p) lines.push(`${w}: price not loaded`);
        else if (!p.available) lines.push(`${w}: price unavailable (${p.reason})`);
        else
          lines.push(
            `${w}${w === instrument ? " (THE INSTRUMENT)" : ""}: week open ${fmt(w, p.weekOpen)} | latest close ${fmt(w, p.latest)} on ${p.latestDate} | week high ${fmt(w, p.high)} | week low ${fmt(w, p.low)} | prior week close ${p.prevWeekClose == null ? "n/a" : fmt(w, p.prevWeekClose)} | change ${p.changePct.toFixed(2)}%`
          );
      }
    } catch {
      lines.push("(prices unavailable)");
    }

    // Calendar (current week only)
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
        for (const e of events)
          lines.push(`${new Date(e.date).toLocaleString()} | ${e.country} | ${e.impact} | ${e.title} | previous ${e.previous || "-"} | forecast ${e.forecast || "-"}`);
      } catch {
        lines.push("(calendar unavailable)");
      }
    }

    lines.push("", "== TRADER'S TRADING PLAN ==");
    if (!plans || plans.length === 0) lines.push("No trading plan entered.");
    else for (const p of plans) lines.push(JSON.stringify(p).slice(0, 1500));

    const chartLinks = [
      { label: "H4", url: entry?.chart_h4 ?? "" },
      { label: "15m", url: entry?.chart_15m ?? "" },
    ].filter((c) => c.url);
    return { text: lines.join("\n"), chartLinks };
  }

  async function start() {
    setError(null);
    setBusy(true);
    setMessages([]);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("You need to be signed in.");
        return;
      }
      setStatus("Loading prices, calendar and your notes…");
      const built = await buildPack(session.access_token);
      setPack(built.text);
      setCharts(built.chartLinks);
      setStatus(
        `Loaded: prices, ${weekOf === mondayOf(new Date()) ? "calendar, " : ""}your entry and plan, ${built.chartLinks.length} chart link(s).`
      );
      const history: Msg[] = [{ role: "user", content: KICKOFF, hidden: true }];
      const data = await callChat(history, built.text, built.chartLinks, session.access_token);
      if (data.error) setError(data.error);
      else setMessages([...history, { role: "assistant", content: data.text }]);
    } catch {
      setError("Something failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !pack) return;
    setInput("");
    setError(null);
    const history: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("You need to be signed in.");
        return;
      }
      const data = await callChat(history, pack, charts, session.access_token);
      if (data.error) setError(data.error);
      else setMessages([...history, { role: "assistant", content: data.text }]);
    } catch {
      setError("Failed to get a reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-medium">Desk chat</h1>
        <p className="text-sm text-neutral-500">
          Talk through your position with the desk partner. It sees the same real prices, calendar, notes and chart links you do, and it will push back when the data doesn&apos;t support you.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        >
          {WATCHLIST.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
        <select
          value={weekOf}
          onChange={(e) => setWeekOf(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week of {w}
              {w === mondayOf(new Date()) ? " (current)" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={start}
          disabled={busy}
          className="rounded bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {messages.length ? "Restart with fresh data" : "Start chat"}
        </button>
      </div>
      {status && <p className="text-xs text-neutral-500">{status}</p>}
      {error && (
        <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">{error}</div>
      )}

      {messages.length > 0 && (
        <div className="space-y-3 rounded-lg border border-neutral-800 p-4">
          {messages
            .filter((m) => !m.hidden)
            .map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-200"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          {busy && <p className="text-xs text-neutral-500">Desk partner is thinking…</p>}
          <div ref={endRef} />
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Argue your position, or ask it to challenge you… (Enter to send, Shift+Enter for a new line)"
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="rounded bg-neutral-100 px-4 text-sm font-medium text-neutral-900 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
      <p className="text-xs text-neutral-600">
        Chat history is not saved: it resets when you reload the page or change the pair or week. It never gives buy/sell calls, entries, stops or targets.
      </p>
    </div>
  );
}
