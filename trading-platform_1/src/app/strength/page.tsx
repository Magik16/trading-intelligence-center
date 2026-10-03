"use client";
import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";

type Week = { weekOf: string; pct: number; inProgress: boolean };
type Pair = {
  label: string;
  upLabel: string;
  downLabel: string;
  seriesId: string;
  weeks: Week[];
  error: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Excel-style palette: one fixed color per instrument inside each chart.
const COLORS = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"];

const SERIES_NAME: Record<string, string> = {
  DEXUSEU: "EUR/USD",
  DEXUSUK: "GBP/USD",
  DTWEXBGS: "USD index (inverted)",
  DCOILWTICO: "USOIL",
  NASDAQCOM: "NASDAQ",
  SP500: "S&P 500",
  DJIA: "US30",
  CBBTCUSD: "BTC",
};

const GROUPS: { title: string; caption: string; ids: string[] }[] = [
  {
    title: "Currencies — who won each week",
    caption:
      "Above 0 = EUR / GBP stronger (USD weaker). Below 0 = USD stronger. The USD index is flipped so it reads the same way as the pairs.",
    ids: ["DEXUSEU", "DEXUSUK", "DTWEXBGS"],
  },
  {
    title: "Stock indices — buyers vs sellers",
    caption: "Above 0 = buyers won the week. Below 0 = sellers won.",
    ids: ["NASDAQCOM", "SP500", "DJIA"],
  },
  {
    title: "Oil & Bitcoin — buyers vs sellers",
    caption: "Above 0 = buyers won the week. Below 0 = sellers won. Bigger moves, so they get their own scale.",
    ids: ["DCOILWTICO", "CBBTCUSD"],
  },
];

function weekLabel(weekOf: string): string {
  const [, m, d] = weekOf.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

// The USD index rises when USD wins; flip it (exactly) so "above 0" always means USD weaker.
function chartValue(p: Pair, pct: number): number {
  return p.seriesId === "DTWEXBGS" ? (1 / (1 + pct / 100) - 1) * 100 : pct;
}

export default function StrengthPage() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weekly-strength")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setPairs(d.pairs ?? []);
      })
      .catch(() => setError("Failed to load weekly data"))
      .finally(() => setLoading(false));
  }, []);

  // Columns = every week that appears for any instrument, oldest -> newest.
  const allWeeks = Array.from(new Set(pairs.flatMap((p) => p.weeks.map((w) => w.weekOf)))).sort().slice(-12);
  const lastWeek = allWeeks[allWeeks.length - 1];

  function buildRows(groupPairs: Pair[]) {
    return allWeeks.map((wk) => {
      const row: Record<string, string | number | boolean> = {
        week: weekLabel(wk) + (wk === lastWeek ? "*" : ""),
        inProgress: groupPairs.some((p) => p.weeks.find((w) => w.weekOf === wk)?.inProgress),
      };
      for (const p of groupPairs) {
        const w = p.weeks.find((x) => x.weekOf === wk);
        if (w && !p.error) row[SERIES_NAME[p.seriesId]] = Number(chartValue(p, w.pct).toFixed(2));
      }
      return row;
    });
  }

  const colorFor: Record<string, string> = {};
  for (const g of GROUPS) g.ids.forEach((id, i) => (colorFor[id] = COLORS[i % COLORS.length]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Weekly strength</h1>
        <p className="text-sm text-neutral-500">
          Who dominated each week, based on the real weekly price change (last 12 weeks).
        </p>
      </div>

      {error && (
        <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">
          {error}.
        </div>
      )}

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <>
          {GROUPS.map((g) => {
            const groupPairs = g.ids
              .map((id) => pairs.find((p) => p.seriesId === id))
              .filter((p): p is Pair => !!p);
            const rows = buildRows(groupPairs);
            const failed = groupPairs.filter((p) => p.error);
            return (
              <section key={g.title} className="rounded-lg border border-neutral-800 p-4">
                <h2 className="text-center text-base font-medium text-neutral-200">{g.title}</h2>
                <p className="mb-3 text-center text-xs text-neutral-500">{g.caption}</p>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                      <XAxis dataKey="week" stroke="#737373" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#737373" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                      <ReferenceLine y={0} stroke="#737373" />
                      <Tooltip
                        formatter={(value) => `${Number(value).toFixed(2)}%`}
                        contentStyle={{ background: "#171717", border: "1px solid #404040", fontSize: 12 }}
                        labelStyle={{ color: "#d4d4d4" }}
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      />
                      <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                      {groupPairs.map((p) => (
                        <Bar key={p.seriesId} dataKey={SERIES_NAME[p.seriesId]} fill={colorFor[p.seriesId]}>
                          {rows.map((r, i) => (
                            <Cell key={i} fillOpacity={r.inProgress ? 0.45 : 1} />
                          ))}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {failed.length > 0 && (
                  <p className="mt-2 text-xs text-amber-400">
                    Couldn&apos;t load: {failed.map((p) => `${SERIES_NAME[p.seriesId]} (${p.error})`).join(", ")}
                  </p>
                )}
              </section>
            );
          })}

          <section className="rounded-lg border border-neutral-800 p-4">
            <h2 className="mb-3 text-sm font-medium text-neutral-300">Scoreboard</h2>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="py-1">Instrument</th>
                  <th>Last completed week</th>
                  <th>Weeks led (shown above)</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => {
                  const completed = p.weeks.filter((w) => !w.inProgress && allWeeks.includes(w.weekOf));
                  const last = completed[completed.length - 1];
                  const up = completed.filter((w) => w.pct > 0).length;
                  const down = completed.filter((w) => w.pct < 0).length;
                  return (
                    <tr key={p.seriesId} className="border-t border-neutral-900">
                      <td className="py-1.5">
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-sm"
                          style={{ backgroundColor: colorFor[p.seriesId] }}
                        />
                        {p.label}
                      </td>
                      <td className="text-neutral-300">
                        {p.error
                          ? "—"
                          : last
                          ? `${last.pct >= 0 ? p.upLabel : p.downLabel} (${Math.abs(last.pct).toFixed(2)}% move)`
                          : "n/a"}
                      </td>
                      <td className="text-neutral-300">
                        {p.error ? "—" : `${p.upLabel} ${up} · ${p.downLabel} ${down}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      <div className="space-y-1 text-xs text-neutral-600">
        <p>* Latest week is still in progress (faded bars) — it can still flip. This shows what already happened, not a forecast.</p>
        <p>
          Source: FRED (Federal Reserve). EUR/USD, GBP/USD and the USD index come from the Fed&apos;s weekly H.10
          release, so their most recent week can be missing until the following Monday. The USD index is the Fed&apos;s
          broad dollar index (a DXY proxy, not the exact ICE DXY). US30 uses the Dow Jones index, not futures. Gold
          isn&apos;t included — I couldn&apos;t confirm a free FRED series for it.
        </p>
      </div>
    </div>
  );
}
