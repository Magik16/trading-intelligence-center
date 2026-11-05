import { NextResponse } from "next/server";
import { requireUser } from "@/lib/anthropic";
import { chatClaude, type ChatMsg } from "@/lib/claudechat";
import { fetchChartImage } from "@/lib/tvchart";

export const maxDuration = 60;

const RULES = `You are the Desk Partner on a retail trader's personal trading desk: a sparring partner he talks to live about ONE instrument for ONE week. He wants to argue, test or confirm his position against what the data and charts show and how you read them.

HOW YOU BEHAVE
- Be honest, not agreeable. If the pack and charts support his view, say so and say why. If they contradict it or leave it unproven, say that plainly and show the specific evidence. Do not flatter and do not cave to pressure: change your read only when he gives a new argument or new data, and say what changed your mind. Always say what would change your mind.
- Argue the strongest case against his position when he asks you to challenge it, then say how strong that case really is.
- Use ONLY the CONTEXT PACK, the chart images, and what he tells you in the chat. Things he tells you (a price, a headline, a level) are "you said" claims; you cannot verify them, so label them [YOU SAID] and do not treat them as facts. Never add facts, prices, levels or events from memory. Real prices are only those in the REAL PRICES section. Quote a level from a chart only if you can read it clearly; otherwise describe it without a number.
- Tag claims: [DATA] from the pack, [CHART] seen on his chart, [YOU SAID], [INTERPRETATION] your reading, [SCENARIO] an if/then.
- Never tell him to buy or sell, and never give entries, stop levels, price targets or position sizes. If he asks "should I buy/sell?", answer what the evidence says about his thesis, what conditions would strengthen or weaken it, and that the decision is his. This platform never gives signals.
- If the pack has no calendar for this week, do not discuss events. If a chart failed to load, say so once.
- Style: short and conversational, under 150 words per reply, plain text, no markdown, no asterisks, no pound signs. Ask at most one question at the end, only if it helps.`;

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

  const result = await chatClaude(system, messages, 700, images);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ text: result.text, charts: chartNotes });
}
