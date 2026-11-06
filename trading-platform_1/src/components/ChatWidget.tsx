"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { WATCHLIST } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string; hidden?: boolean };
type Price =
  | { available: false; reason: string }
  | { available: true; weekOpen: number; latest: number; latestDate: string; high: number; low: number; prevWeekClose: number | null; changePct: number; daily?: { date: string; open: number; high: number; low: number; close: number }[] };

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
  "Start the session. In ICT / supply and demand terms and under 110 words, give me your read of this instrument for this week: HTF bias, premium or discount, liquidity taken or not, what my chart shows if loaded, the news, and your lean (long, short or stay out) with conviction. Then ask for my view so we can argue it.";

export default function ChatWidget() {
  const supabase = createClient();
  const weeks = recentWeeks();
  const [open, setOpen] = useState(false);
  const [weekOf, setWeekOf] = useState(mondayOf(new Date()));
  const [instrument, setInstrument] = useState<string>(WATCHLIST[0]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pack, setPack] = useState<string | null>(null);
  const [charts, setCharts] = useState<{ label: string; url: string }[]>([]);
  const [status, setStatus] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, open]);

  // A different pair or week means a fresh conversation.
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
    const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

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

    lines.push("", `== REAL PRICES FOR THE WEEK OF ${weekOf} (daily data, Yahoo Finance; only prices in this section are real) ==`);
    const [pricesRes, newsRes] = await Promise.all([
      fetch("/api/week-prices", { method: "POST", headers: auth, body: JSON.stringify({ weekOf }) })
        .then((r) => r.json())
        .catch(() => null),
      isCurrent
        ? fetch("/api/news", { method: "POST", headers: auth, body: JSON.stringify({ instrument }) })
            .then((r) => r.json())
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    const prices = (pricesRes?.prices ?? null) as Record<string, Price> | null;
    if (!prices) lines.push("(prices unavailable)");
    else {
      const order = [instrument, ...WATCHLIST.filter((w) => w !== instrument)];
      for (const w of order) {
        const p = prices[w];
        if (!p) lines.push(`${w}: price not loaded`);
        else if (!p.available) lines.push(`${w}: price unavailable (${p.reason})`);
        else
          lines.push(
            `${w}${w === instrument ? " (THE INSTRUMENT)" : ""}: week open ${fmt(w, p.weekOpen)} | latest close ${fmt(w, p.latest)} on ${p.latestDate} | week high ${fmt(w, p.high)} | week low ${fmt(w, p.low)} | prior week close ${p.prevWeekClose == null ? "n/a" : fmt(w, p.prevWeekClose)} | change ${p.changePct.toFixed(2)}%`
          );
      }
    }

    // Daily candles and computed ICT reference levels for the selected instrument
    const ip = prices?.[instrument];
    lines.push("", `== DAILY CANDLES AND KEY LEVELS FOR ${instrument} (computed from the daily data above; no intraday data) ==`);
    if (!ip || !ip.available || !ip.daily || ip.daily.length === 0) {
      lines.push("(daily candles unavailable)");
    } else {
      const d = ip.daily;
      const prior = d.filter((c) => c.date < weekOf);
      const cur = d.filter((c) => c.date >= weekOf);
      for (const c of d)
        lines.push(`${c.date} ${c.date < weekOf ? "(prior week)" : "(this week)"} | open ${fmt(instrument, c.open)} | high ${fmt(instrument, c.high)} | low ${fmt(instrument, c.low)} | close ${fmt(instrument, c.close)}`);
      if (prior.length > 0) {
        const pwh = Math.max(...prior.map((c) => c.high));
        const pwl = Math.min(...prior.map((c) => c.low));
        lines.push(`Prior week high (PWH) ${fmt(instrument, pwh)} | prior week low (PWL) ${fmt(instrument, pwl)} | prior week equilibrium ${fmt(instrument, (pwh + pwl) / 2)}`);
        lines.push(
          `This week's high ${fmt(instrument, ip.high)} is ${ip.high > pwh ? "ABOVE" : "below"} PWH (buy-side liquidity ${ip.high > pwh ? "swept" : "not yet taken"}); this week's low ${fmt(instrument, ip.low)} is ${ip.low < pwl ? "BELOW" : "above"} PWL (sell-side liquidity ${ip.low < pwl ? "swept" : "not yet taken"}).`
        );
      }
      const mid = (ip.high + ip.low) / 2;
      const pos = ip.high > ip.low ? ((ip.latest - ip.low) / (ip.high - ip.low)) * 100 : 50;
      lines.push(
        `Weekly range so far: low ${fmt(instrument, ip.low)} to high ${fmt(instrument, ip.high)} | equilibrium (50%) ${fmt(instrument, mid)} | latest close ${fmt(instrument, ip.latest)} sits at ${pos.toFixed(0)}% of the range (${pos > 50 ? "premium" : pos < 50 ? "discount" : "at equilibrium"}).`
      );
      lines.push(`Latest close is ${ip.latest > ip.weekOpen ? "ABOVE" : "BELOW"} the weekly open ${fmt(instrument, ip.weekOpen)}.`);
      if (cur.length >= 2) {
        const pd = cur[cur.length - 2];
        lines.push(`Previous day (${pd.date}) high (PDH) ${fmt(instrument, pd.high)} | low (PDL) ${fmt(instrument, pd.low)}.`);
      }
    }

    lines.push("", "== NEWS HEADLINES (Google News, last 3 days; headlines only, reported by outlets, not verified) ==");
    if (!isCurrent) lines.push(`News is only loaded for the current week, not for the week of ${weekOf}. Do not discuss news.`);
    else lines.push(newsRes?.text ?? "(news unavailable)");

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
    return { text: lines.join("\n"), chartLinks, hasNews: !!newsRes?.text && !String(newsRes.text).startsWith("(news unavailable") };
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
      setStatus("Loading prices, news, calendar and your notes…");
      const built = await buildPack(session.access_token);
      setPack(built.text);
      setCharts(built.chartLinks);
      setStatus(
        `Loaded: prices, ${built.hasNews ? "news, " : ""}${weekOf === mondayOf(new Date()) ? "calendar, " : ""}your entry and plan, ${built.chartLinks.length} chart link(s).`
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
    if (!text || busy) return;
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
      let context = pack;
      let chartLinks = charts;
      if (!context) {
        // First message before "Start chat": load the data first, then send what you wrote.
        setStatus("Loading prices, news, calendar and your notes…");
        const built = await buildPack(session.access_token);
        context = built.text;
        chartLinks = built.chartLinks;
        setPack(built.text);
        setCharts(built.chartLinks);
        setStatus(
          `Loaded: prices, ${built.hasNews ? "news, " : ""}${weekOf === mondayOf(new Date()) ? "calendar, " : ""}your entry and plan, ${built.chartLinks.length} chart link(s).`
        );
      }
      const data = await callChat(history, context, chartLinks, session.access_token);
      if (data.error) setError(data.error);
      else setMessages([...history, { role: "assistant", content: data.text }]);
    } catch {
      setError("Failed to get a reply.");
    } finally {
      setBusy(false);
    }
  }

  const visible = messages.filter((m) => !m.hidden);

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[560px] max-h-[75vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
            <span className="text-sm font-medium">Desk partner</span>
            <div className="ml-auto flex items-center gap-1">
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs"
              >
                {WATCHLIST.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
              <select
                value={weekOf}
                onChange={(e) => setWeekOf(e.target.value)}
                className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs"
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    {w.slice(5)}
                    {w === mondayOf(new Date()) ? " (now)" : ""}
                  </option>
                ))}
              </select>
              <button onClick={() => setOpen(false)} className="px-1.5 text-neutral-400 hover:text-white" aria-label="Close chat">
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {visible.length === 0 && !busy && (
              <div className="space-y-3 pt-6 text-center">
                <p className="text-sm text-neutral-400">
                  Pick a pair and week, then type your message below, or let it speak first. It reads real prices, news headlines, your notes and chart links, gives you its lean, and argues with you.
                </p>
                <button onClick={start} className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900">
                  Let the desk partner start on {instrument}
                </button>
              </div>
            )}
            {visible.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user" ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-neutral-800 text-neutral-100"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-neutral-800 px-3 py-2 text-sm text-neutral-400">
                  {pack ? "Thinking…" : status || "Loading…"}
                </div>
              </div>
            )}
            {error && <div className="rounded border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-300">{error}</div>}
            <div ref={endRef} />
          </div>

          {status && visible.length > 0 && <p className="px-3 pb-1 text-[11px] text-neutral-600">{status}</p>}
          {(
            <div className="border-t border-neutral-800 p-2">
              <div className="flex items-end gap-2">
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
                  placeholder={visible.length === 0 ? "Write your view first, e.g. I want to short NASDAQ at…" : "Argue your view, or ask: should I short here?"}
                  className="flex-1 resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                />
                <button
                  onClick={send}
                  disabled={busy || !input.trim()}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Send
                </button>
              </div>
              {visible.length > 0 && (
                <button onClick={start} disabled={busy} className="mt-1 text-[11px] text-neutral-500 hover:text-neutral-300 disabled:opacity-40">
                  New chat with fresh data
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open desk chat"}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl hover:bg-blue-500"
      >
        {open ? (
          <span className="text-xl">✕</span>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </>
  );
}
