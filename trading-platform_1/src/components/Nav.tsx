"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import ChatWidget from "@/components/ChatWidget";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/macro", label: "Macro" },
  { href: "/weekly-bias", label: "Weekly bias" },
  { href: "/strength", label: "Weekly strength" },
  { href: "/team", label: "Team" },
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
    <>
    <header className="sticky top-0 z-40 px-4 pt-3">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-xl">
        <Link href="/dashboard" className="flex items-center gap-2 pr-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 4l9 8-9 8V4z" fill="#f5b301" />
            <path d="M12 4l8 8-8 8-3-2.7L14 12 9 6.7 12 4z" fill="#f5b301" opacity="0.6" />
          </svg>
          <span className="hidden text-sm font-medium tracking-tight text-white 2xl:inline">Trading Intelligence</span>
        </Link>
        <div className="flex flex-wrap items-center gap-0.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-2.5 py-1.5 text-[13px] transition-colors whitespace-nowrap ${
                pathname === l.href
                  ? "bg-white/12 text-white"
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
              
              <button
                onClick={signOut}
                className="rounded-full border border-white/15 px-4 py-1.5 text-neutral-300 hover:bg-white/10 hover:text-white"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-white px-4 py-1.5 font-medium text-neutral-900 hover:bg-neutral-200"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
    {email && <ChatWidget />}
    </>
  );
}
