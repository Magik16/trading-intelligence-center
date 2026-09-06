"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/macro", label: "Macro" },
  { href: "/weekly-bias", label: "Weekly bias" },
  { href: "/plan", label: "Trading plan" },
  { href: "/journal", label: "Journal" },
  { href: "/risk", label: "Risk calculator" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2">
      <div className="flex flex-wrap gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded px-3 py-1.5 text-sm ${
              pathname === l.href
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        {email ? (
          <>
            <span className="text-neutral-500">{email}</span>
            <button
              onClick={signOut}
              className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-400 hover:text-white"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-400 hover:text-white"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
