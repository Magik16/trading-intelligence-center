import { NextResponse } from "next/server";
import { requireUser } from "@/lib/anthropic";

export const maxDuration = 30;

// Real daily prices for the selected week, from Yahoo Finance's public chart
// endpoint (no key needed, but unofficial: it can fail or be delayed).
// Nothing is ever estimated: if a symbol fails, it comes back as unavailable.
const SYMBOLS: Record<string, string> = {
  "EUR/USD": "EURUSD=X",
  "GBP/USD": "GBPUSD=X",
  DXY: "DX-Y.NYB",
  GOLD: "GC=F",
  USOIL: "CL=F",
  NASDAQ: "^NDX",
  "S&P 500": "^GSPC",
  US30: "^DJI",
  BTC: "BTC-USD",
};

type Candle = { date: string; open: number; high: number; low: number; close: number };

async function fetchCandles(symbol: string, weekOf: string): Promise<Candle[] | null> {
  const start = Math.floor(new Date(weekOf + "T00:00:00Z").getTime() / 1000) - 6 * 86400;
  const end = start + 14 * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&period1=${start}&period2=${end}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const ts: number[] | undefined = r?.timestamp;
    const q = r?.indicators?.quote?.[0];
    if (!ts || !q) return null;
    const off: number = r?.meta?.gmtoffset ?? 0;
    const out: Candle[] = [];
    ts.forEach((t, i) => {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if ([o, h, l, c].some((v) => typeof v !== "number")) return;
      out.push({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), open: o, high: h, low: l, close: c });
    });
    return out;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let weekOf = "";
  try {
    weekOf = String((await req.json()).weekOf ?? "").slice(0, 10);
  } catch {
    /* fall through */
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) {
    return NextResponse.json({ error: "Bad week." }, { status: 400 });
  }
  const weekEnd = new Date(new Date(weekOf + "T00:00:00Z").getTime() + 6 * 86400000)
    .toISOString()
    .slice(0, 10);

  const entries = await Promise.all(
    Object.entries(SYMBOLS).map(async ([name, symbol]) => {
      const candles = await fetchCandles(symbol, weekOf);
      if (!candles) return [name, { available: false, reason: "price source unavailable" }] as const;
      const week = candles.filter((c) => c.date >= weekOf && c.date <= weekEnd);
      if (week.length === 0) return [name, { available: false, reason: "no trading days yet for this week" }] as const;
      const prev = candles.filter((c) => c.date < weekOf).pop();
      const open = week[0].open;
      const last = week[week.length - 1];
      const high = Math.max(...week.map((c) => c.high));
      const low = Math.min(...week.map((c) => c.low));
      return [
        name,
        {
          available: true,
          symbol,
          weekOpen: open,
          latest: last.close,
          latestDate: last.date,
          high,
          low,
          prevWeekClose: prev?.close ?? null,
          changePct: ((last.close - open) / open) * 100,
        },
      ] as const;
    })
  );
  return NextResponse.json({ weekOf, prices: Object.fromEntries(entries) });
}
