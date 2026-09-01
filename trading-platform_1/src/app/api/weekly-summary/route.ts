import { NextResponse } from "next/server";

// Calls the Anthropic API to explain the week's biases in plain language.
// This reads your own entered bias/notes and explains it back to you — it
// never invents market data or generates a buy/sell signal on its own.
// Get a key at https://console.anthropic.com (separate from claude.ai).

type Entry = {
  instrument: string;
  bias: string;
  key_levels: string;
  notes: string;
};

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to your hosting environment." },
      { status: 500 }
    );
  }

  const { weekOf, entries } = (await req.json()) as { weekOf: string; entries: Entry[] };

  const bullets = entries
    .map(
      (e) =>
        `- ${e.instrument}: ${e.bias}${e.key_levels ? ` | levels: ${e.key_levels}` : ""}${
          e.notes ? ` | notes: ${e.notes}` : ""
        }`
    )
    .join("\n");

  const prompt = `You are summarizing a trader's own weekly bias notes for the week of ${weekOf}. Here is exactly what they entered for each instrument:

${bullets}

Write a short, clear plain-language summary (4-6 sentences) that:
- Restates their bias per instrument in their own terms, not invented data
- Notes any instruments where their bias and key levels seem to conflict or are worth double-checking
- Does NOT add new market data, price levels, or opinions they didn't provide
- Does NOT suggest trades or give buy/sell instructions — just clarify and organize what they wrote

Keep it grounded strictly in what they entered.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Anthropic API returned ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const summary = data.content?.[0]?.text ?? "No summary returned.";
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ error: "Failed to reach Anthropic API" }, { status: 502 });
  }
}
