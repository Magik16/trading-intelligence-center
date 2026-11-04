"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type Report = {
  weekOf: string;
  dataPack: string;
  analyst: string | null;
  manager: string | null;
  tokensIn: number;
  tokensOut: number;
};

type Saved = {
  week_of: string;
  data_pack: string;
  analyst: string;
  manager: string;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
};

// Same Monday logic as the Weekly bias page, so the week keys match.
function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function localStamp(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type Db = ReturnType<typeof createClient>;

async function buildDataPack(supabase: Db, weekOf: string): Promise<string> {
  const now = new Date();
  const monthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [cal, macro, strength, bias, monthBias, plans] = await Promise.all([
    fetch("/api/calendar").then((r) => r.json()).catch(() => ({ error: "calendar unavailable" })),
    fetch("/api/macro").then((r) => r.json()).catch(() => ({ error: "macro data unavailable" })),
    fetch("/api/weekly-strength").then((r) => r.json()).catch(() => ({ error: "weekly strength unavailable" })),
    supabase.from("weekly_bias").select("instrument,bias,key_levels,notes").eq("week_of", weekOf),
    supabase.from("monthly_bias").select("instrument,bias,notes").eq("month", monthValue),
    supabase.from("trading_plans").select("name,style,markets,sessions,rules"),
  ]);

  const lines: string[] = [];
  lines.push(`TODAY: ${now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
  lines.push(`WEEK OF (Monday): ${weekOf}`);
  lines.push("All times below are in the trader's local time zone.");
  lines.push("THE TRADER'S INSTRUMENTS: EUR/USD, GBP/USD, DXY, GOLD, USOIL, NASDAQ, S&P 500, US30, BTC");

  // Calendar
  lines.push("", "== ECONOMIC CALENDAR (this week; USD, EUR and GBP events; high and medium impact only) ==");
  if (cal.error) {
    lines.push(`(unavailable: ${cal.error})`);
  } else {
    type Ev = { title: string; country: string; date: string; impact: string; forecast: string | null; previous: string | null; actual: string | null };
    const events = ((cal.events ?? []) as Ev[])
      .filter((e) => ["USD", "EUR", "GBP"].includes(e.country))
      .filter((e) => ["high", "medium"].includes((e.impact ?? "").toLowerCase()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 70);
    if (events.length === 0) lines.push("(no events)");
    for (const e of events) {
      lines.push(
        `${localStamp(e.date)} | ${e.country} | ${e.impact} | ${e.title} | previous ${e.previous || "-"} | forecast ${e.forecast || "-"} | actual ${e.actual || "-"}`
      );
    }
  }

  // Macro
  lines.push("", "== US MACRO DATA (FRED: latest value, change vs prior release) ==");
  if (macro.error) {
    lines.push(`(unavailable: ${macro.error})`);
  } else {
    type Ind = { label: string; unit: string; latest: number | null; previous: number | null; pctChange: number | null; lastDate: string | null };
    for (const i of (macro.indicators ?? []) as Ind[]) {
      lines.push(
        `${i.label}: ${i.latest ?? "n/a"} ${i.unit} (previous ${i.previous ?? "n/a"}${
          i.pctChange != null ? `, ${i.pctChange.toFixed(2)}% vs prior` : ""
        }, as of ${i.lastDate ?? "n/a"})`
      );
    }
  }

  // Weekly strength
  lines.push("", "== WEEKLY PRICE MOVES (last 4 weeks, % change; * = week still in progress) ==");
  if (strength.error) {
    lines.push(`(unavailable: ${strength.error})`);
  } else {
    type Pr = { label: string; upLabel: string; downLabel: string; error: string | null; weeks: { weekOf: string; pct: number; inProgress: boolean }[] };
    for (const p of (strength.pairs ?? []) as Pr[]) {
      if (p.error) {
        lines.push(`${p.label}: unavailable (${p.error})`);
        continue;
      }
      const recent = p.weeks.slice(-4).map((w) => `${w.weekOf}${w.inProgress ? "*" : ""} ${w.pct >= 0 ? "+" : ""}${w.pct.toFixed(2)}%`);
      lines.push(`${p.label} (up = ${p.upLabel} won, down = ${p.downLabel} won): ${recent.join(", ") || "no data"}`);
    }
  }

  // Trader's own view
  lines.push("", "== THE TRADER'S OWN VIEW (their opinion, not fact) ==");
  const m = (monthBias.data ?? []) as { instrument: string; bias: string; notes: string | null }[];
  lines.push(`Monthly outlook (${monthValue}):`);
  const mFilled = m.filter((r) => r.bias !== "Neutral" || (r.notes ?? "").trim());
  if (mFilled.length === 0) lines.push("- nothing entered");
  for (const r of mFilled) lines.push(`- ${r.instrument}: ${r.bias}${r.notes ? ` | ${r.notes}` : ""}`);
  const w = (bias.data ?? []) as { instrument: string; bias: string; key_levels: string | null; notes: string | null }[];
  lines.push(`Weekly bias (week of ${weekOf}):`);
  const wFilled = w.filter((r) => r.bias !== "Neutral" || (r.notes ?? "").trim() || (r.key_levels ?? "").trim());
  if (wFilled.length === 0) lines.push("- nothing entered");
  for (const r of wFilled) {
    lines.push(`- ${r.instrument}: ${r.bias}${r.key_levels ? ` | levels: ${r.key_levels}` : ""}${r.notes ? ` | notes: ${r.notes}` : ""}`);
  }

  // Trading plan
  lines.push("", "== THE TRADER'S TRADING PLAN(S) (their own rules) ==");
  type Plan = { name: string; style: string | null; markets: string[] | null; sessions: string[] | null; rules: { free_text?: string } | null };
  const ps = ((plans.data ?? []) as Plan[]).slice(0, 3);
  if (ps.length === 0) lines.push("- no plan entered");
  for (const p of ps) {
    const rules = (p.rules?.free_text ?? "").trim().slice(0, 700);
    lines.push(
      `- ${p.name} (${p.style ?? "style n/a"}; markets: ${(p.markets ?? []).join(", ") || "n/a"}; sessions: ${(p.sessions ?? []).join(", ") || "n/a"})${rules ? ` | rules: ${rules}` : ""}`
    );
  }

  // Gaps
  lines.push(
    "",
    "== DATA GAPS (do not fill these from memory) ==",
    "- No live news headlines are included; only the calendar, US macro data, weekly price moves and the trader's notes.",
    "- No price data for GOLD is included; only the trader's own notes if they wrote any.",
    "- EUR/USD, GBP/USD and the USD index update a week late, so their latest week may be missing.",
    "- Macro data is US only; there is no EUR or GBP macro data in this pack.",
    "- The calendar only includes USD, EUR and GBP events; events for other currencies are not included."
  );
  return lines.join("\n");
}

type PairBlock = { name: string; fields: { label: string; text: string }[]; bias: string | null };

// Turns the analyst's "=== NAME ===" blocks into cards. Returns null if the format isn't followed,
// in which case the page falls back to showing the plain text.
function parseResume(text: string): { intro: string; pairs: PairBlock[]; tail: string } | null {
  const tailIdx = text.search(/^NOT VERIFIED/m);
  const main = tailIdx >= 0 ? text.slice(0, tailIdx) : text;
  const tail = tailIdx >= 0 ? text.slice(tailIdx).trim() : "";
  const parts = main.split(/^===\s*(.+?)\s*===\s*$/m);
  if (parts.length < 7) return null; // need at least 3 instruments
  const pairs: PairBlock[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const fields: { label: string; text: string }[] = [];
    for (const line of (parts[i + 1] ?? "").split("\n")) {
      const m = line.match(/^(BIAS|APPROACH|CAREFUL):\s*(.*)$/);
      if (m) fields.push({ label: m[1], text: m[2].trim() });
      else if (line.trim() && fields.length) fields[fields.length - 1].text += " " + line.trim();
    }
    const bias = fields.find((f) => f.label === "BIAS")?.text.match(/^(bullish|bearish|neutral|no view)/i);
    pairs.push({ name: parts[i].trim(), fields, bias: bias ? bias[1] : null });
  }
  return { intro: parts[0].trim(), pairs, tail };
}

function biasColor(bias: string): string {
  const b = bias.toLowerCase();
  if (b.startsWith("bullish")) return "bg-green-900 text-green-200";
  if (b.startsWith("bearish")) return "bg-red-900 text-red-200";
  return "bg-neutral-800 text-neutral-300";
}

async function callAgent(
  payload: { agent: "analyst" | "manager"; dataPack: string; analystReport?: string },
  token: string
): Promise<{ text?: string; usage?: { input: number; output: number }; error?: string }> {
  try {
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) return { error: data.error ?? `Request failed (${res.status})` };
    return { text: data.text, usage: data.usage };
  } catch {
    return { error: "Could not reach the server." };
  }
}

function verdictOf(text: string): { label: string; color: string } | null {
  const m = text.match(/^VERDICT:\s*(.+)$/im);
  if (!m) return null;
  const label = m[1].trim();
  const l = label.toLowerCase();
  const color = l.includes("rework")
    ? "bg-red-900 text-red-200"
    : l.includes("correction")
    ? "bg-amber-900 text-amber-200"
    : "bg-green-900 text-green-200";
  return { label, color };
}

function AgentCard({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge?: { label: string; color: string } | null;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-neutral-100">{title}</h2>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        {badge && <span className={`rounded px-2 py-1 text-xs font-medium ${badge.color}`}>{badge.label}</span>}
      </div>
      {children}
    </section>
  );
}

export default function TeamPage() {
  const supabase = createClient();
  const [report, setReport] = useState<Report | null>(null);
  const [stage, setStage] = useState<"idle" | "gathering" | "analyst" | "manager">("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function loadSaved() {
    const { data } = await supabase
      .from("team_reports")
      .select("*")
      .order("week_of", { ascending: false })
      .limit(12);
    setSaved((data ?? []) as Saved[]);
  }

  useEffect(() => {
    loadSaved();
  }, []);

  function showSaved(s: Saved) {
    setError(null);
    setSavedAt(s.created_at);
    setReport({
      weekOf: s.week_of,
      dataPack: s.data_pack,
      analyst: s.analyst,
      manager: s.manager,
      tokensIn: s.tokens_in,
      tokensOut: s.tokens_out,
    });
  }

  async function runMeeting() {
    setError(null);
    setReport(null);
    setSavedAt(null);
    setStage("gathering");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setError("You need to be signed in to run the team.");
      setStage("idle");
      return;
    }

    const weekOf = mondayOf(new Date());
    const dataPack = await buildDataPack(supabase, weekOf);
    let current: Report = { weekOf, dataPack, analyst: null, manager: null, tokensIn: 0, tokensOut: 0 };
    setReport(current);

    setStage("analyst");
    const a = await callAgent({ agent: "analyst", dataPack }, session.access_token);
    if (a.error || !a.text) {
      setError(`News analyst failed: ${a.error ?? "no response"}`);
      setStage("idle");
      return;
    }
    current = {
      ...current,
      analyst: a.text,
      tokensIn: current.tokensIn + (a.usage?.input ?? 0),
      tokensOut: current.tokensOut + (a.usage?.output ?? 0),
    };
    setReport(current);

    setStage("manager");
    const m = await callAgent({ agent: "manager", dataPack, analystReport: a.text }, session.access_token);
    if (m.error || !m.text) {
      setError(`Team manager failed: ${m.error ?? "no response"} (the analyst's report above has NOT been reviewed).`);
      setStage("idle");
      return;
    }
    current = {
      ...current,
      manager: m.text,
      tokensIn: current.tokensIn + (m.usage?.input ?? 0),
      tokensOut: current.tokensOut + (m.usage?.output ?? 0),
    };
    setReport(current);
    setStage("idle");

    const { error: saveError } = await supabase.from("team_reports").upsert(
      {
        user_id: session.user.id,
        week_of: weekOf,
        data_pack: dataPack,
        analyst: current.analyst,
        manager: current.manager,
        tokens_in: current.tokensIn,
        tokens_out: current.tokensOut,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,week_of" }
    );
    if (saveError) setError(`Report generated but could not be saved: ${saveError.message}`);
    else loadSaved();
  }

  const running = stage !== "idle";
  const stageText =
    stage === "gathering"
      ? "Gathering this week's data…"
      : stage === "analyst"
      ? "News analyst is writing the briefing…"
      : stage === "manager"
      ? "Team manager is reviewing the briefing…"
      : "";

  const resume = report?.analyst ? parseResume(report.analyst) : null;
  const verdict = report?.manager ? verdictOf(report.manager) : null;
  const managerBody = report?.manager ? report.manager.replace(/^VERDICT:.*\n?/im, "").trim() : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Your team</h1>
        <p className="text-sm text-neutral-500">
          The News analyst gives you a quick resume for each instrument, then the Team manager checks it against the data.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={runMeeting}
          disabled={running}
          className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {running ? "Team is working…" : "Run weekly team meeting"}
        </button>
        {stageText && <span className="text-sm text-neutral-400">{stageText}</span>}
      </div>

      {error && (
        <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">{error}</div>
      )}

      {saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>Past reports:</span>
          {saved.map((s) => (
            <button
              key={s.week_of}
              onClick={() => showSaved(s)}
              className={`rounded border px-2 py-1 ${
                report?.weekOf === s.week_of && savedAt === s.created_at
                  ? "border-neutral-500 text-white"
                  : "border-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              Week of {s.week_of}
            </button>
          ))}
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">
            Week of {report.weekOf}
            {savedAt ? ` · saved ${localStamp(savedAt)}` : ""}
          </p>

          <AgentCard title="News analyst" subtitle="Quick resume: how to approach each instrument this week">
            {report.analyst ? (
              resume ? (
                <div className="space-y-4">
                  {resume.intro && <p className="whitespace-pre-wrap text-sm text-neutral-200">{resume.intro}</p>}
                  <div className="grid gap-3 md:grid-cols-2">
                    {resume.pairs.map((p) => (
                      <div key={p.name} className="rounded border border-neutral-800 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-neutral-100">{p.name}</span>
                          {p.bias && (
                            <span className={`rounded px-2 py-0.5 text-xs ${biasColor(p.bias)}`}>{p.bias}</span>
                          )}
                        </div>
                        <div className="space-y-1.5 text-xs">
                          {p.fields.map((f, i) => (
                            <p key={i} className="text-neutral-300">
                              <span className="mr-1 font-medium uppercase text-neutral-500">{f.label}</span>
                              {f.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {resume.tail && <p className="whitespace-pre-wrap text-xs text-neutral-500">{resume.tail}</p>}
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-neutral-200">{report.analyst}</p>
              )
            ) : (
              <p className="text-sm text-neutral-500">Writing…</p>
            )}
          </AgentCard>

          <AgentCard
            title="Team manager"
            subtitle="Checks the briefing against the data pack only — it can't verify the real world"
            badge={verdict}
          >
            {report.manager ? (
              <p className="whitespace-pre-wrap text-sm text-neutral-200">{managerBody}</p>
            ) : (
              <p className="text-sm text-neutral-500">
                {report.analyst ? "Reviewing…" : "Waiting for the news analyst."}
              </p>
            )}
          </AgentCard>

          <details className="rounded-lg border border-neutral-800 p-4">
            <summary className="cursor-pointer text-sm text-neutral-400">
              Data the team was given (the only facts they may use)
            </summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-neutral-500">{report.dataPack}</pre>
          </details>

          {report.tokensIn + report.tokensOut > 0 && (
            <p className="text-xs text-neutral-600">
              AI usage this run: {report.tokensIn.toLocaleString()} tokens in, {report.tokensOut.toLocaleString()} out.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-neutral-600">
        Reports are generated from the data shown above, not live news, and are not trade advice. Every statement is
        tagged FACT, DATA, INTERPRETATION or SCENARIO.
      </p>
    </div>
  );
}
