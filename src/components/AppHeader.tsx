import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { getMe } from "@/lib/session";
import { Logo } from "./Logo";

type Section = "saison" | "spieltag" | "statistik" | "archiv";

const NAV: { key: Section; label: string; href: string | null }[] = [
  { key: "saison", label: "Saison", href: "/" },
  { key: "spieltag", label: "Spieltag", href: "/spieltag" },
  { key: "statistik", label: "Statistik", href: "/statistik" },
  { key: "archiv", label: "Archiv", href: "/#archiv" },
];

export function AppHeader({ active, chip }: { active: Section; chip?: ReactNode }) {
  return (
    <header className="app-header">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" className="brand">
          <Logo />
          <span className="brand-name">RASENSCHACH</span>
        </Link>
        {chip}
      </div>
      <nav className="nav" aria-label="Hauptnavigation">
        {NAV.map((n) =>
          n.href ? (
            <Link key={n.key} href={n.href} className="nav-link" aria-current={n.key === active ? "page" : undefined}>
              {n.label}
            </Link>
          ) : (
            <span key={n.key} className="nav-link" aria-disabled="true" title="Seite folgt">
              {n.label}
            </span>
          ),
        )}
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </nav>
    </header>
  );
}

async function UserMenu() {
  const me = await getMe();
  if (!me) return null;
  const color = me.slot === "bent" ? "var(--bent-light)" : me.slot === "bjoern" ? "var(--bjoern-light)" : "var(--text)";
  return (
    <form action={logout} style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
      <span style={{ color, fontWeight: 600, padding: "0 4px" }}>{me.displayName}</span>
      {me.isAdmin && <span className="chip-admin">ADMIN</span>}
      {me.isAdmin && (
        <Link href="/vereine" className="nav-link" style={{ fontSize: 13 }}>
          Vereine
        </Link>
      )}
      <button type="submit" className="btn btn-ghost">
        Abmelden
      </button>
    </form>
  );
}
