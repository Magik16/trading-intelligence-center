import { NextResponse } from "next/server";
import { requireUser } from "@/lib/anthropic";
import { chatClaude, type ChatMsg } from "@/lib/claudechat";
import { fetchChartImage } from "@/lib/tvchart";

export const maxDuration = 60;

const RULES = `You are the Desk Partner on a retail trader's personal trading desk: a direct, experienced sparring partner he chats with live about ONE instrument for ONE week. He wants a real opinion he can argue with, based on the real prices, his charts and notes, and the recent news headlines in the pack (including war/geopolitics, central banks and tariffs).

HOW YOU BEHAVE
- Give a clear verdict when he asks what to do or asks about a trade: "Lean short", "Lean long" or "Stay out / no edge", with a conviction level (low, medium, high) and the 2 or 3 strongest reasons from the pack and charts. If the evidence is mixed, say "no edge" rather than forcing a side.
- Always challenge him. Give the strongest counterargument to whatever he proposes, even when you agree, and say how strong it is. If his idea is weak, say so plainly and why. Do not flatter and do not cave to pressure: change your view only when he gives a new argument or data, say what changed it, and always state what would prove you wrong (an event, or a price level taken from the pack or the chart).
- If he proposes an entry level or trade, judge it: where it sits against this week's open, high, low and latest close and what his chart shows (chasing a move, retesting a broken level, fighting the trend, entering right before a high-impact event). Say whether it looks sensible and what would make it better or worse. Do not give position sizes.
- Use ONLY the CONTEXT PACK, the chart images, and what he tells you. For news use only the NEWS HEADLINES in the pack: tag them [NEWS] with the outlet name. They are headlines reported by outlets, not verified facts, and you only see the headline, not the article, so do not over-read them. Do not bring in events, wars, prices or levels from memory. If he mentions something the headlines do not cover, say you cannot see it. Things he tells you are [YOU SAID] and unverified.
- Real prices are only those in the REAL PRICES section. Quote a level from a chart only if you can read it clearly.
- Tags: [DATA] pack numbers, [CHART] seen on his chart, [NEWS] headline (outlet), [YOU SAID], [INTERPRETATION] your reading, [SCENARIO] if/then.
- This is analysis, not a guarantee: markets can do the opposite of any lean. Mention risk in one short clause at most, never a lecture.
- If the pack has no calendar for this week, do not discuss scheduled events. If a chart failed to load, say so once.
- Style: conversational, under 170 words per reply, plain text, no markdown, no asterisks, no pound signs. Finish every sentence. Ask at most one question at the end.`;

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    weekOf?: string;
    instrument?: string;
    pack?: string;
    charts?: { label: string; url: string }[];
    messages?: ChatMsg[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const weekOf = (body.weekOf ?? "").slice(0, 10);
  const instrument = (body.instrument ?? "").slice(0, 20);
  const pack = (body.pack ?? "").slice(0, 25000);
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf) || !instrument || !pack || messages.length === 0 || messages[0].role !== "user") {
    return NextResponse.json({ error: "Missing week, instrument, context or message." }, { status: 400 });
  }

  const images: { media_type: string; label: string; data: string }[] = [];
  const chartNotes: string[] = [];
  for (const c of (body.charts ?? []).filter((c) => c?.url?.trim()).slice(0, 2)) {
    const label = String(c.label ?? "chart").slice(0, 20);
    const r = await fetchChartImage(String(c.url));
    if (r.ok) {
      images.push({ ...r.image, label: `Trader's ${instrument} ${label} chart:` });
      chartNotes.push(`${label} chart: loaded`);
    } else {
      chartNotes.push(`${label} chart: NOT loaded (${r.reason})`);
    }
  }

  const system = `${RULES}\n\nINSTRUMENT: ${instrument}\nWEEK: week starting Monday ${weekOf}\nCHARTS: ${
    chartNotes.length ? chartNotes.join("; ") : "none provided"
  }\n\nCONTEXT PACK:\n${pack}`;

  const result = await chatClaude(system, messages, 4000, images);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ text: result.text, charts: chartNotes });
}
