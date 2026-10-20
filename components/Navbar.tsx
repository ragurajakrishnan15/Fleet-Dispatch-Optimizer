"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

const links = [
  { href: "/demand", label: "Demand" },
  { href: "/optimizer", label: "Optimizer" },
  { href: "/experiment", label: "Experiments" },
  { href: "/metrics", label: "Metrics" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between" aria-label="Main">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" onClick={() => setOpen(false)}>
          <span className="inline-block size-2.5 rounded-full bg-accent" aria-hidden />
          Fleet Dispatch Optimizer
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <NavLink key={l.href} {...l} active={pathname.startsWith(l.href)} />
          ))}
          <ThemeToggle />
        </div>

        <div className="md:hidden flex items-center gap-1">
          <ThemeToggle />
          <button
            className="p-2 rounded-md hover:bg-panel-2"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {open ? <path d="M4 4l12 12M16 4L4 16" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div id="mobile-menu" className="md:hidden border-t border-line px-4 py-2 flex flex-col">
          {links.map((l) => (
            <NavLink key={l.href} {...l} active={pathname.startsWith(l.href)} onClick={() => setOpen(false)} />
          ))}
        </div>
      )}
    </header>
  );
}

function NavLink({ href, label, active, onClick }: { href: string; label: string; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`px-3 py-2 rounded-md text-sm transition-colors ${
        active ? "bg-accent-soft text-fg font-medium" : "text-muted hover:text-fg hover:bg-panel-2"
      }`}
    >
      {label}
    </Link>
  );
}
