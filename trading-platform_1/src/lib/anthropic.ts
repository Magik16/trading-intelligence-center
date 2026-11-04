import { createClient } from "@supabase/supabase-js";

// Shared helpers for the AI "team" routes.
// - requireUser: only a signed-in user (valid Supabase session token) may spend your AI credits.
// - askClaude: one call to the Anthropic Messages API using ANTHROPIC_API_KEY (server-side only).

const MODEL = "claude-sonnet-5-5";

export async function requireUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false as const, status: 401, error: "Sign in required." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false as const, status: 500, error: "Supabase env vars are missing." };
  const supabase = createClient(url, anon);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false as const, status: 401, error: "Invalid or expired session. Sign in again." };
  }
  return { ok: true as const, userId: data.user.id };
}

export async function askClaude(system: string, user: string, maxTokens = 1500) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false as const, error: "ANTHROPIC_API_KEY is not set." };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false as const, error: `Anthropic API returned ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    const blocks = (data.content ?? []) as { type: string; text?: string }[];
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    if (!text) {
      // Never pretend an empty reply is a success: say why it was empty.
      const kinds = blocks.map((b) => b.type).join(", ") || "none";
      return {
        ok: false as const,
        error: `The model returned no text (stop reason: ${data.stop_reason ?? "unknown"}; content blocks: ${kinds}). Try again.`,
      };
    }
    return {
      ok: true as const,
      text,
      usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
    };
  } catch {
    return { ok: false as const, error: "Failed to reach the Anthropic API." };
  }
}
