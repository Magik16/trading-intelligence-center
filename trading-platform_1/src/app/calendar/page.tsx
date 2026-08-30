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

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");

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

  const filtered =
    filter === "All" ? events : events.filter((e) => e.country === filter);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">Economic calendar (this week)</h1>

      {error && (
        <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">
          {error}.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {["All", "USD", "EUR", "GBP"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-2 py-1 text-xs ${
              filter === f ? "bg-neutral-100 text-neutral-900" : "bg-neutral-800"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : filtered.length === 0 && !error ? (
        <p className="text-neutral-500">No events found for this filter.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-2">Date/time</th>
              <th>Event</th>
              <th>Currency</th>
              <th>Impact</th>
              <th>Previous</th>
              <th>Forecast</th>
              <th>Actual</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 80).map((e, i) => (
              <tr key={i} className="border-t border-neutral-800">
                <td className="py-2">
                  {e.date ? new Date(e.date).toLocaleString() : "—"}
                </td>
                <td>{e.title}</td>
                <td>{e.country}</td>
                <td>
                  <ImpactDot impact={e.impact} />
                </td>
                <td>{e.previous ?? "—"}</td>
                <td>{e.forecast ?? "—"}</td>
                <td>{e.actual ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
