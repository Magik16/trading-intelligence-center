"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  return (
    <nav className="flex gap-1 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
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
    </nav>
  );
}
