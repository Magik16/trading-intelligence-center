"use client";
import { useEffect, useState } from "react";
import { WATCHLIST } from "@/lib/types";

type Event = {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function timeLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  if (!hasTime) return "All Day";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currencyFilter, setCurrencyFilter] = useState<string>("All");
  const [impactOnly, setImpactOnly] = useState(true); // default: High + Medium only

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setEvents(d.events ?? []);
      })
      .catch(() => setError("Failed to load calendar"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = events
    .filter((e) => currencyFilter === "All" || e.country === currencyFilter)
    .filter((e) => {
      if (!impactOnly) return true;
      const level = e.impact?.toLowerCase();
      return level === "high" || level === "medium";
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Group events by calendar day (YYYY-MM-DD), preserving chronological order.
  const grouped: { dayKey: string; events: Event[] }[] = [];
  for (const e of filtered) {
    const dayKey = e.date.slice(0, 10);
    let group = grouped.find((g) => g.dayKey === dayKey);
    if (!group) {
      group = { dayKey, events: [] };
      grouped.push(group);
    }
    group.events.push(e);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">Economic calendar (this week)</h1>

      {error && (
        <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">
          {error}.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2">
          {["All", "USD", "EUR", "GBP"].map((f) => (
            <button
              key={f}
              onClick={() => setCurrencyFilter(f)}
              className={`rounded px-2 py-1 text-xs ${
                currencyFilter === f ? "bg-neutral-100 text-neutral-900" : "bg-neutral-800"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={impactOnly}
            onChange={(e) => setImpactOnly(e.target.checked)}
          />
          High &amp; medium impact only
          <span className="ml-1 flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          </span>
        </label>
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : grouped.length === 0 && !error ? (
        <p className="text-neutral-500">No events found for this filter.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-800 text-neutral-500">
              <tr>
                <th className="w-28 py-2 pl-3">Day</th>
                <th className="w-20">Time</th>
                <th>Event</th>
                <th className="w-16">Ccy</th>
                <th className="w-12">Impact</th>
                <th className="w-20">Previous</th>
                <th className="w-20">Forecast</th>
                <th className="w-20 pr-3">Actual</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <>
                  {group.events.map((e, i) => (
                    <tr key={`${group.dayKey}-${i}`} className="border-t border-neutral-900">
                      <td className="py-2 pl-3 align-top font-medium text-neutral-300">
                        {i === 0 ? dayLabel(group.dayKey) : ""}
                      </td>
                      <td className="align-top text-neutral-500">{timeLabel(e.date)}</td>
                      <td className="align-top">{e.title}</td>
                      <td className="align-top text-neutral-400">{e.country}</td>
                      <td className="align-top">
                        <ImpactDot impact={e.impact} />
                      </td>
                      <td className="align-top text-neutral-500">{e.previous ?? "—"}</td>
                      <td className="align-top text-neutral-500">{e.forecast ?? "—"}</td>
                      <td className="align-top pr-3 text-neutral-500">{e.actual ?? "—"}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="pt-4 text-xs text-neutral-600">
        Your watchlist: {WATCHLIST.join(", ")}. Full per-asset relevance
        filtering (e.g. "show me only events that move GOLD") uses the{" "}
        <code>event_asset_relevance</code> table from the architecture doc —
        wire that up once you've validated this base calendar view.
      </p>
    </div>
  );
}

function ImpactDot({ impact }: { impact: string }) {
  const color =
    impact?.toLowerCase() === "high"
      ? "bg-red-500"
      : impact?.toLowerCase() === "medium"
      ? "bg-amber-500"
      : "bg-green-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}
