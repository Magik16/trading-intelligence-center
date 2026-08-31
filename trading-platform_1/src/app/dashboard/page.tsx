import Link from "next/link";
import { WATCHLIST } from "@/lib/types";

const cards = [
  { href: "/calendar", title: "Economic calendar", desc: "Live events for the week ahead, filterable by currency and asset." },
    { href: "/macro", title: "Macro dashboard", desc: "USD indicators — inflation, employment, growth, policy rates." },
  { href: "/plan", title: "Trading plan", desc: "Define your setups, sessions, and rules." },
  { href: "/journal", title: "Journal", desc: "Log trades and track win rate, R, and plan compliance." },
  { href: "/risk", title: "Risk calculator", desc: "Position sizing and drawdown simulation." },
];

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Dashboard</h1>
        <p className="text-sm text-neutral-500">
          Watchlist: {WATCHLIST.join(" · ")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-neutral-800 p-4 hover:border-neutral-600"
          >
            <div className="font-medium">{c.title}</div>
            <div className="mt-1 text-sm text-neutral-500">{c.desc}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
        This is the Phase 1 shell. Macro dashboards, currency comparator, and
        asset macro profiles come in Phase 2 once the calendar and journal are
        proven out — see the architecture doc for the full roadmap.
      </div>
    </div>
  );
}
