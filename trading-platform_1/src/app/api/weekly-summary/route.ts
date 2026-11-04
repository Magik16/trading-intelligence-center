import { NextResponse } from "next/server";
import { askClaude, requireUser } from "@/lib/anthropic";
import { fetchChartImage } from "@/lib/tvchart";

export const maxDuration = 60;

const SYSTEM = `You are the News Analyst on a retail trader's personal trading desk. For ONE instrument and ONE specific week, you answer: "For this week, how should I trade it?"

You are given a WEEK PACK (text) and, sometimes, the trader's own TradingView chart screenshots (H4 and/or 15 minute) for this instrument.

RULES
- Everything is about the week named in the pack only. Use ONLY the pack and the chart images. Do not add facts, prices, levels or headlines from memory.
- Start each claim with one tag: [FACT] (from the pack), [DATA] (a number or date from the pack), [CHART] (something you can see on the trader's chart image), [INTERPRETATION] (your reading), or [SCENARIO] (an if/then possibility).
- Real prices come only from the REAL PRICES section of the pack. On a chart image, only quote a price level if you can read it clearly on the price axis or a label; if you are unsure, describe it without a number and say it is hard to read. Never invent or round prices. If a chart could not be loaded, say so once.
- Never tell the trader to buy or sell, and never give entries, stops or price targets. "How to trade it" means conditions: what the structure and levels say, which of the trader's own levels matter, when to be careful (event windows, only if in the pack), and what would invalidate the lean.
- BIAS: if the trader entered a bias, notes or levels for this instrument, start with "Your view: <their bias>" and say whether the real price and the chart support or contradict it. If they entered nothing, do NOT answer "No view entered". Instead write "Price read (you entered no bias): Bullish | Bearish | Neutral" and justify it from the real weekly price move and the chart images, clearly as a description of what price did, not a trade call.
- Each of the three lines is under 40 words. Plain text only: no markdown, no asterisks, no pound signs.

FORMAT (exactly three lines, nothing else)
BIAS: <as described above, with tags>
APPROACH: <how to trade the week, as conditions, with tags>
CAREFUL: <what to watch or what invalidates it, with tags>`;

type ChartIn = { label: string; url: string };

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { weekOf?: string; instrument?: string; pack?: string; charts?: ChartIn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const weekOf = (body.weekOf ?? "").slice(0, 10);
  const instrument = (body.instrument ?? "").slice(0, 20);
  const pack = (body.pack ?? "").slice(0, 25000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf) || !pack || !instrument) {
    return NextResponse.json({ error: "Missing week, instrument or data." }, { status: 400 });
  }

  const charts = (body.charts ?? []).filter((c) => c?.url?.trim()).slice(0, 2);
  const images: { media_type: string; label: string; data: string }[] = [];
  const chartNotes: string[] = [];
  for (const c of charts) {
    const label = String(c.label ?? "chart").slice(0, 20);
    const r = await fetchChartImage(String(c.url));
    if (r.ok) {
      images.push({ ...r.image, label: `Trader's ${instrument} ${label} chart:` });
      chartNotes.push(`${label} chart: loaded (image attached)`);
    } else {
      chartNotes.push(`${label} chart: NOT loaded (${r.reason})`);
    }
  }

  const user = `INSTRUMENT: ${instrument}\nWEEK: week starting Monday ${weekOf}\n\nCHART LINKS: ${
    chartNotes.length ? chartNotes.join("; ") : "none provided"
  }\n\nWEEK PACK:\n${pack}`;

  const result = await askClaude(SYSTEM, user, 1200, images);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ text: result.text, charts: chartNotes });
}
