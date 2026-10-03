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
  LabelList,
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

const GROUPS: { title: string; caption: string; ids: string[]; left: string; right: string }[] = [
  {
    title: "Currencies — who won each week",
    caption:
      "Above 0 = EUR / GBP stronger (USD weaker). Below 0 = USD stronger. The USD index is flipped so it reads the same way as the pairs.",
    ids: ["DEXUSEU", "DEXUSUK", "DTWEXBGS"],
    left: "USD stronger",
    right: "EUR / GBP stronger",
  },
  {
    title: "Stock indices — buyers vs sellers",
    caption: "Above 0 = buyers won the week. Below 0 = sellers won.",
    ids: ["NASDAQCOM", "SP500", "DJIA"],
    left: "Sellers won",
    right: "Buyers won",
  },
  {
    title: "Oil & Bitcoin — buyers vs sellers",
    caption: "Above 0 = buyers won the week. Below 0 = sellers won. Bigger moves, so they get their own scale.",
    ids: ["DCOILWTICO", "CBBTCUSD"],
    left: "Sellers won",
    right: "Buyers won",
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

// Symmetric axis with round numbers, so zero sits in the middle and bar labels have room.
function niceScale(rows: Record<string, string | number | boolean>[], names: string[]) {
  let maxAbs = 0;
  for (const r of rows) {
    for (const n of names) {
      const v = r[n];
      if (typeof v === "number") maxAbs = Math.max(maxAbs, Math.abs(v));
    }
  }
  maxAbs = Math.max(maxAbs * 1.15, 0.1);
  const steps = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
  const step = steps.find((s) => Math.ceil(maxAbs / s) <= 4) ?? 100;
  const max = Math.ceil(maxAbs / step) * step;
  const ticks: number[] = [];
  for (let t = -max; t <= max + 1e-9; t += step) ticks.push(Number(t.toFixed(4)));
  return { max, ticks };
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
            const names = groupPairs.map((p) => SERIES_NAME[p.seriesId]);
            // drop weeks with no data for this group (e.g. FX lag), newest week at the top
            const rows = buildRows(groupPairs)
              .filter((r) => names.some((n) => typeof r[n] === "number"))
              .reverse();
            const { max: axisMax, ticks: axisTicks } = niceScale(rows, names);
            const chartHeight = rows.length * (groupPairs.length * 15 + 26) + 70;
            const failed = groupPairs.filter((p) => p.error);
            return (
              <section key={g.title} className="rounded-lg border border-neutral-800 p-4">
                <h2 className="text-center text-base font-medium text-neutral-200">{g.title}</h2>
                <p className="mb-3 text-center text-xs text-neutral-500">{g.caption}</p>
                <div className="mb-1 flex justify-between px-1 text-xs font-medium text-neutral-400">
                  <span>◀ {g.left}</span>
                  <span>{g.right} ▶</span>
                </div>
                <div className="w-full" style={{ height: chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={rows}
                      margin={{ top: 4, right: 48, left: 4, bottom: 0 }}
                      barCategoryGap="18%"
                      barGap={2}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[-axisMax, axisMax]}
                        ticks={axisTicks}
                        stroke="#737373"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <YAxis type="category" dataKey="week" stroke="#737373" tick={{ fontSize: 11 }} width={62} />
                      <ReferenceLine x={0} stroke="#a3a3a3" />
                      <Tooltip
                        formatter={(value) => `${Number(value).toFixed(2)}%`}
                        contentStyle={{ background: "#171717", border: "1px solid #404040", fontSize: 12 }}
                        labelStyle={{ color: "#d4d4d4" }}
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      />
                      <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                      {groupPairs.map((p) => (
                        <Bar
                          key={p.seriesId}
                          dataKey={SERIES_NAME[p.seriesId]}
                          fill={colorFor[p.seriesId]}
                          isAnimationActive={false}
                        >
                          {rows.map((r, i) => (
                            <Cell key={i} fillOpacity={r.inProgress ? 0.45 : 1} />
                          ))}
                          <LabelList
                            dataKey={SERIES_NAME[p.seriesId]}
                            position="right"
                            formatter={(v: unknown) => `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}`}
                            style={{ fontSize: 10, fill: "#a3a3a3" }}
                          />
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
