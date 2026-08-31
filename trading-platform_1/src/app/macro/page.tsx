"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

type Indicator = {
  id: string;
  label: string;
  category: string;
  unit: string;
  latest: number | null;
  previous: number | null;
  pctChange: number | null;
  sparkline: number[];
  lastDate: string | null;
};

const CATEGORIES = ["Inflation", "Employment", "Growth", "Monetary Policy", "Other"];

export default function MacroPage() {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/macro")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setIndicators(d.indicators ?? []);
      })
      .catch(() => setError("Failed to load macro data"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">USD macro dashboard</h1>
        <p className="text-sm text-neutral-500">
          Official data from FRED. EUR/GBP dashboards need a different data
          source (ECB, ONS) — not wired up yet.
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
        CATEGORIES.map((cat) => {
          const items = indicators.filter((i) => i.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat} className="space-y-3">
              <h2 className="text-sm font-medium text-neutral-400">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((i) => (
                  <IndicatorCard key={i.id} indicator={i} />
                ))}
              </div>
            </section>
          );
        })
      )}

      <p className="pt-4 text-xs text-neutral-600">
        This is raw indicator data, not yet a composite score. The
        transparent weighted scoring described in the architecture doc
        (inflation/growth/employment/policy weights, user-configurable) is
        the next layer to build on top of this — this page is the data
        foundation it reads from.
      </p>
    </div>
  );
}

function IndicatorCard({ indicator }: { indicator: Indicator }) {
  const { label, unit, latest, pctChange, sparkline, lastDate } = indicator;
  const up = (pctChange ?? 0) >= 0;
  const chartData = sparkline.map((v, idx) => ({ idx, v }));

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-neutral-500">{label}</div>
          <div className="mt-1 text-2xl font-medium">
            {latest !== null ? latest.toLocaleString() : "—"}
            <span className="ml-1 text-xs text-neutral-500">{unit}</span>
          </div>
          {pctChange !== null && (
            <div className={`text-xs ${up ? "text-green-400" : "text-red-400"}`}>
              {up ? "+" : ""}
              {pctChange.toFixed(2)}% vs prior
            </div>
          )}
          {lastDate && (
            <div className="mt-1 text-[10px] text-neutral-600">as of {lastDate}</div>
          )}
        </div>
        <div className="h-12 w-20">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={up ? "#4ade80" : "#f87171"}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
