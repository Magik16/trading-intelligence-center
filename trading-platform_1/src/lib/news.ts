// Recent headlines (Google News RSS, no key needed) for one instrument plus general
// market-moving news (war/geopolitics, central banks, tariffs). Headlines only:
// they are reports from outlets, not verified facts.

const QUERIES: Record<string, string> = {
  "EUR/USD": "EUR/USD euro dollar ECB",
  "GBP/USD": "GBP/USD pound sterling Bank of England",
  DXY: "US dollar index DXY Federal Reserve",
  GOLD: "gold price",
  USOIL: "oil prices crude OPEC",
  NASDAQ: "Nasdaq 100 stocks tech",
  "S&P 500": "S&P 500 stock market",
  US30: "Dow Jones stock market",
  BTC: "bitcoin price",
};
const GENERAL = ["war OR geopolitics OR sanctions markets", "Federal Reserve OR inflation OR tariffs OR jobs report"];

type Item = { title: string; source: string; date: Date };

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

export function parseFeed(xml: string): Item[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: Item[] = [];
  for (const it of items) {
    const t = it.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const p = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const s = it.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1];
    if (!t || !p) continue;
    const date = new Date(decode(p));
    if (isNaN(date.getTime())) continue;
    const source = s ? decode(s) : "unknown source";
    let title = decode(t);
    const suffix = ` - ${source}`;
    if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
    out.push({ title, source, date });
  }
  return out;
}

async function fetchFeed(q: string): Promise<Item[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:3d")}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    return parseFeed(await res.text());
  } catch {
    return [];
  }
}

function line(i: Item) {
  return `${i.date.toISOString().slice(0, 16).replace("T", " ")}Z | ${i.source} | ${i.title}`;
}

export async function getNews(instrument: string): Promise<string> {
  const q = QUERIES[instrument];
  if (!q) return "(no news query for this instrument)";
  const [mine, ...general] = await Promise.all([q, ...GENERAL].map(fetchFeed));
  const seen = new Set<string>();
  const pick = (items: Item[], n: number) =>
    items
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true)))
      .slice(0, n);
  const a = pick(mine, 8);
  const b = pick(general.flat(), 8);
  if (a.length === 0 && b.length === 0) return "(news unavailable right now)";
  return [
    `-- about ${instrument} (newest first) --`,
    ...(a.length ? a.map(line) : ["(none found)"]),
    "-- general: war/geopolitics, central banks, tariffs, data --",
    ...(b.length ? b.map(line) : ["(none found)"]),
  ].join("\n");
}
