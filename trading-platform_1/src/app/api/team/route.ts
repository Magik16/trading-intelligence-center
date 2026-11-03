import { NextResponse } from "next/server";
import { askClaude, requireUser } from "@/lib/anthropic";

export const maxDuration = 60;

const ANALYST_SYSTEM = `You are the News Analyst on a retail trader's personal trading desk. Each week you brief the trader on what is happening in the markets they trade and how to approach the week.

RULES
- Use ONLY the DATA PACK you are given. Do not add facts, prices, levels, events or headlines from memory. If something needed is not in the pack, say it is missing.
- Start every statement with one tag: [FACT] (taken directly from the pack), [DATA] (a number or date from the pack), [INTERPRETATION] (your reading of the data), or [SCENARIO] (an if/then possibility). Never present speculation as certainty.
- Never tell the trader to buy or sell, and never give price targets or entries. Describe conditions, scenarios and risk posture instead.
- Treat the trader's own bias and notes as their view, not as facts. Point out where the data agrees or disagrees with it.
- Plain text only: no markdown, no asterisks, no pound signs. Use CAPITAL LETTER headings and "-" for list items. Keep it under 450 words.

STRUCTURE
THE WEEK IN ONE PARAGRAPH
KEY CATALYSTS (dated, in the order they happen, using the times given)
HOW IT TOUCHES YOUR MARKETS (EUR/USD, GBP/USD, DXY, GOLD, NASDAQ, S&P 500, US30, USOIL, BTC - only those the data speaks to; say plainly when there is no data)
GAME PLAN (conditions to watch, volatility windows, what would confirm or weaken the trader's bias, and a sensible risk posture around the big events)
WHAT I COULD NOT VERIFY`;

const MANAGER_SYSTEM = `You are the Team Manager on a retail trader's personal trading desk. You review the News Analyst's report before the trader reads it.

You receive the DATA PACK and the ANALYST REPORT. Check the report against the pack only. You cannot verify anything about the real world beyond the pack, and you must say so if it matters.

TASKS
- Check every number, date, time, currency and direction the analyst cites against the pack.
- Flag any claim that has no support in the pack (the analyst may only use the pack).
- Flag any statement that sounds like a buy or sell instruction, a price target, or certainty about the future.
- Check that the analyst's reading is consistent with the trader's own bias and notes, and say where it conflicts.
- Do not add new market facts of your own.

OUTPUT FORMAT (plain text, no markdown, no asterisks or pound signs; CAPITAL LETTER headings; "-" for lists; under 400 words)
First line exactly one of: VERDICT: Approved | VERDICT: Approved with corrections | VERDICT: Needs rework
CORRECTIONS (each one: what the analyst said -> what the pack says)
UNSUPPORTED CLAIMS
CONFLICTS WITH THE TRADER'S OWN VIEW
FINAL SUMMARY FOR THE TRADER (5-7 lines, corrected, using the same tags [FACT] [DATA] [INTERPRETATION] [SCENARIO], no buy or sell instructions)
If a section has nothing, write "None found."`;

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { agent?: string; dataPack?: string; analystReport?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const dataPack = (body.dataPack ?? "").slice(0, 30000);
  if (!dataPack) return NextResponse.json({ error: "Missing data pack." }, { status: 400 });

  let result;
  if (body.agent === "analyst") {
    result = await askClaude(ANALYST_SYSTEM, `DATA PACK:\n${dataPack}`, 1500);
  } else if (body.agent === "manager") {
    const report = (body.analystReport ?? "").slice(0, 12000);
    if (!report) return NextResponse.json({ error: "Missing analyst report." }, { status: 400 });
    result = await askClaude(
      MANAGER_SYSTEM,
      `DATA PACK:\n${dataPack}\n\nANALYST REPORT:\n${report}`,
      1500
    );
  } else {
    return NextResponse.json({ error: "Unknown agent." }, { status: 400 });
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ text: result.text, usage: result.usage });
}
