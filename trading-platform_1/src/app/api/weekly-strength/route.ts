import { NextResponse } from "next/server";

// Weekly "who dominated" data from FRED (official/public series, same
// FRED_API_KEY as the macro dashboard). For each instrument we take the last
// available close of each Mon-Sun week and compare it with the prior week.
//
// Note: FRED's FX series (H.10 release) are updated once a week, so the
// latest week for EUR/USD and GBP/USD can be missing until the next Monday.

type Instrument = {
  id: string; // FRED series id
  label: string;
  upLabel: string; // who "wins" when the series rises
  downLabel: string; // who "wins" when it falls
};

const INSTRUMENTS: Instrument[] = [
  { id: "DEXUSEU", label: "EUR/USD", upLabel: "EUR", downLabel: "USD" },
  { id: "DEXUSUK", label: "GBP/USD", upLabel: "GBP", downLabel: "USD" },
  { id: "DTWEXBGS", label: "USD index (broad, DXY proxy)", upLabel: "USD", downLabel: "Others" },
  { id: "DCOILWTICO", label: "USOIL (WTI)", upLabel: "Buyers", downLabel: "Sellers" },
  { id: "NASDAQCOM", label: "NASDAQ", upLabel: "Buyers", downLabel: "Sellers" },
  { id: "SP500", label: "S&P 500", upLabel: "Buyers", downLabel: "Sellers" },
  { id: "DJIA", label: "US30 (Dow)", upLabel: "Buyers", downLabel: "Sellers" },
  { id: "CBBTCUSD", label: "BTC", upLabel: "Buyers", downLabel: "Sellers" },
];

type Obs = { date: string; value: number };

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const diff = (d.getUTCDay() + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function weeklyChanges(obs: Obs[], maxWeeks: number) {
  const sorted = [...obs].sort((a, b) => a.date.localeCompare(b.date));
  const lastByWeek = new Map<string, Obs>();
  for (const o of sorted) lastByWeek.set(mondayOf(o.date), o); // later obs overwrite earlier ones
  const weeks = Array.from(lastByWeek.entries()).sort(([a], [b]) => a.localeCompare(b));
  const currentMonday = mondayOf(new Date().toISOString().slice(0, 10));
  const out: { weekOf: string; pct: number; inProgress: boolean }[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1][1].value;
    const cur = weeks[i][1].value;
    if (!prev) continue;
    out.push({
      weekOf: weeks[i][0],
      pct: ((cur - prev) / prev) * 100,
      inProgress: weeks[i][0] === currentMonday,
    });
  }
  return out.slice(-maxWeeks);
}

async function fetchObs(seriesId: string, apiKey: string): Promise<Obs[]> {
  const start = new Date(Date.now() - 110 * 86400000).toISOString().slice(0, 10);
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${start}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`FRED returned ${res.status}`);
  const data = await res.json();
  return (data.observations ?? [])
    .filter((o: { value: string }) => o.value !== ".")
    .map((o: { date: string; value: string }) => ({ date: o.date, value: parseFloat(o.value) }));
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FRED_API_KEY is not set. Add it to your hosting environment." },
      { status: 500 }
    );
  }

  const pairs = await Promise.all(
    INSTRUMENTS.map(async (inst) => {
      try {
        const obs = await fetchObs(inst.id, apiKey);
        return {
          label: inst.label,
          upLabel: inst.upLabel,
          downLabel: inst.downLabel,
          seriesId: inst.id,
          weeks: weeklyChanges(obs, 12),
          error: null as string | null,
        };
      } catch (e) {
        return {
          label: inst.label,
          upLabel: inst.upLabel,
          downLabel: inst.downLabel,
          seriesId: inst.id,
          weeks: [],
          error: e instanceof Error ? e.message : "Failed to load",
        };
      }
    })
  );

  return NextResponse.json({ pairs });
}
