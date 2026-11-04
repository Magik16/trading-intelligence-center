// Turns a TradingView "share image" link (https://www.tradingview.com/x/XXXXXXXX/)
// into an image the AI can look at. Only tradingview.com hosts are ever fetched.

export type ChartImage = { media_type: string; data: string };

const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 4_500_000;

function isTvHost(host: string) {
  return host === "tradingview.com" || host.endsWith(".tradingview.com");
}

async function grabImage(url: string): Promise<ChartImage | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !isTvHost(u.hostname)) return null;
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!OK_TYPES.includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;
    return { media_type: type, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

export async function fetchChartImage(link: string): Promise<{ ok: true; image: ChartImage } | { ok: false; reason: string }> {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return { ok: false, reason: "not a valid link" };
  }
  if (!isTvHost(u.hostname)) return { ok: false, reason: "only TradingView share links (tradingview.com/x/...) are supported" };
  const m = u.pathname.match(/^\/x\/([A-Za-z0-9]+)\/?$/);
  if (!m) return { ok: false, reason: "use the TradingView image share link (tradingview.com/x/...)" };
  const id = m[1];

  // 1) the usual snapshot location
  const direct = await grabImage(`https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`);
  if (direct) return { ok: true, image: direct };

  // 2) fall back to the page's og:image
  try {
    const page = await fetch(`https://www.tradingview.com/x/${id}/`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (page.ok) {
      const html = (await page.text()).slice(0, 200000);
      const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ??
        html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (og) {
        const img = await grabImage(og[1].replace(/&amp;/g, "&"));
        if (img) return { ok: true, image: img };
      }
    }
  } catch {
    /* fall through */
  }
  return { ok: false, reason: "could not load the chart image from TradingView" };
}
