import { NextResponse } from "next/server";
import { askClaude, requireUser } from "@/lib/anthropic";
import { fetchChartImage } from "@/lib/tvchart";

export const maxDuration = 60;

const SYSTEM = `You are the News Analyst on an ICT / supply-and-demand trader's personal desk. For ONE instrument and ONE specific week you answer: "For this week, how should I trade it?" Talk to him as a fellow ICT trader: use the language freely and do not explain basic terms.

You are given a WEEK PACK (text) and, sometimes, his own TradingView chart screenshots (H4 and/or 15 minute) for this instrument.

HIS FRAMEWORK (use it)
- HTF bias, weekly open (above = bullish lean, below = bearish lean), prior week high/low (PWH/PWL), previous day high/low (PDH/PDL).
- Premium vs discount using the equilibrium (50%) of the weekly range: longs belong in discount in a bullish bias, shorts in premium in a bearish bias.
- Liquidity: buy-side above highs, sell-side below lows; say whether it was already swept this week (the pack states it) and where the next pool is.
- Structure and PD arrays: BOS/CHoCH, displacement, fair value gaps, order blocks, supply and demand zones, breakers, mitigation. Killzones and high-impact news timing.

WHAT YOU CAN SEE
- The pack has daily candles with computed levels, premium/discount position and sweep flags. You may derive daily structure and daily fair value gaps from those candles and say so ("on the daily candles").
- Order blocks, supply and demand zones, intraday FVGs and intraday structure can ONLY come from his chart images. If a chart is loaded, read it ("on your chart..."). If none is loaded, say intraday zones can't be seen and rely on daily candles. Never invent a zone or level. Quote a level only if it is in the pack or clearly readable on his chart.

RULES
- Everything is about the week named in the pack only. Use ONLY the pack and the chart images. No facts, prices, levels or headlines from memory. If the pack says calendar data is not available for that week, do not mention events.
- Give a lean when you can: long, short or stay out, with conviction (low, medium, high). If it is mixed, say no edge. No position sizing.
- BIAS line: if he chose a bias (Bullish or Bearish), start with "Your view: <his bias>" and say whether the daily data and chart support or contradict it. If he left it on Neutral, write "Price read (you set no bias): Bullish | Bearish | Neutral" and justify it from the weekly open, premium/discount, liquidity and chart. He no longer writes notes or levels: use his chart images for any zones.
- Say where facts come from in plain words ("daily candles show", "on your chart", "you wrote"). No bracket tags. Quote only the numbers that matter.
- Each of the four lines is under 35 words. Plain text only: no markdown, asterisks or pound signs. Finish every sentence.

FORMAT (exactly four lines, nothing else)
BIAS: <direction read: HTF bias, weekly open, premium or discount, liquidity>
SUGGESTION: <the one thing he should do this week: lean long, lean short or stay out, with conviction, and the single trigger to wait for>
APPROACH: <how to work the week in ICT terms: the zone or level to watch, the confirmation needed (for example sweep then MSS), best timing, and the news to respect>
CAREFUL: <what invalidates the read (one level or event) and the main risk>`;

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

  const result = await askClaude(SYSTEM, user, 4000, images);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ text: result.text, charts: chartNotes });
}
