import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium">Trading Intelligence Center</h1>
      <p className="text-neutral-400">
        Your personal macro trading dashboard, journal, and risk manager.
      </p>
      <Link
        href="/dashboard"
        className="inline-block rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
