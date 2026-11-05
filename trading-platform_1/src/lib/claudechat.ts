// Multi-turn chat with Claude (server-side only). Images, if any, are attached to the first user message.

const MODEL = "claude-sonnet-5-5";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export async function chatClaude(
  system: string,
  messages: ChatMsg[],
  maxTokens: number,
  images: { media_type: string; label?: string; data: string }[] = []
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false as const, error: "ANTHROPIC_API_KEY is not set." };
  const apiMessages = messages.map((m, i) => {
    if (i === 0 && m.role === "user" && images.length > 0) {
      return {
        role: m.role,
        content: [
          ...images.flatMap((im) => [
            ...(im.label ? [{ type: "text", text: im.label }] : []),
            { type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } },
          ]),
          { type: "text", text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: apiMessages }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false as const, error: `Anthropic API returned ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    const text = ((data.content ?? []) as { type: string; text?: string }[])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    if (!text) return { ok: false as const, error: `The model returned no text (stop reason: ${data.stop_reason ?? "unknown"}). Try again.` };
    return { ok: true as const, text };
  } catch {
    return { ok: false as const, error: "Failed to reach the Anthropic API." };
  }
}
