"use client";
import { useEffect, useState } from "react";

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

function weekLabel(weekOf: string): string {
  const [, m, d] = weekOf.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Weekly strength</h1>
        <p className="text-sm text-neutral-500">
          Who dominated each week, based on the real weekly price change. Brighter cell = bigger move.
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
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-neutral-500">
                <th className="sticky left-0 bg-neutral-950 px-3 py-2 text-left font-normal">Instrument</th>
                {allWeeks.map((w, i) => (
                  <th key={w} className="px-1 py-2 text-center font-normal">
                    {weekLabel(w)}
                    {i === allWeeks.length - 1 ? "*" : ""}
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-normal">Led (completed weeks)</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p) => {
                const maxAbs = Math.max(0.01, ...p.weeks.map((w) => Math.abs(w.pct)));
                const byWeek = new Map(p.weeks.map((w) => [w.weekOf, w]));
                const completed = p.weeks.filter((w) => !w.inProgress);
                const upCount = completed.filter((w) => w.pct > 0).length;
                const downCount = completed.filter((w) => w.pct < 0).length;
                return (
                  <tr key={p.seriesId} className="border-t border-neutral-900">
                    <td className="sticky left-0 whitespace-nowrap bg-neutral-950 px-3 py-2 font-medium text-neutral-200">
                      {p.label}
                    </td>
                    {p.error ? (
                      <td colSpan={allWeeks.length + 1} className="px-3 py-2 text-amber-400">
                        Couldn&apos;t load this series ({p.error})
                      </td>
                    ) : (
                      <>
                        {allWeeks.map((w) => {
                          const cell = byWeek.get(w);
                          if (!cell) {
                            return (
                              <td key={w} className="px-1 py-1 text-center text-neutral-700">
                                n/a
                              </td>
                            );
                          }
                          const up = cell.pct >= 0;
                          const alpha = 0.15 + 0.65 * (Math.abs(cell.pct) / maxAbs);
                          const bg = up ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
                          return (
                            <td key={w} className="px-1 py-1">
                              <div
                                className={`rounded px-1 py-1.5 text-center leading-tight ${
                                  cell.inProgress ? "border border-dashed border-neutral-400" : ""
                                }`}
                                style={{ backgroundColor: bg }}
                                title={`${p.label} — week of ${cell.weekOf}: ${cell.pct.toFixed(2)}%${
                                  cell.inProgress ? " (in progress)" : ""
                                }`}
                              >
                                <div className="font-medium text-white">{up ? p.upLabel : p.downLabel}</div>
                                <div className="text-[10px] text-neutral-200">
                                  {up ? "+" : ""}
                                  {cell.pct.toFixed(2)}%
                                </div>
                              </div>
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-3 py-2 text-neutral-300">
                          {p.upLabel} {upCount} · {p.downLabel} {downCount}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-1 text-xs text-neutral-600">
        <p>* Latest column is the current week so far (dashed border) — it can still flip.</p>
        <p>
          Source: FRED (Federal Reserve). EUR/USD, GBP/USD and the USD index come from the Fed&apos;s weekly H.10
          release, so their most recent week can show n/a until the following Monday. The USD index is the Fed&apos;s
          broad dollar index (a DXY proxy, not the exact ICE DXY). US30 uses the Dow Jones index, not futures. Gold
          isn&apos;t included — I couldn&apos;t confirm a free FRED series for it.
        </p>
        <p>This shows what already happened, not a forecast.</p>
      </div>
    </div>
  );
}
