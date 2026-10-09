import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useDesk } from "@/lib/solomon/desk";

const LINKS = [
  { to: "/", label: "Gold" },
  { to: "/partners", label: "Partners" },
  { to: "/borrow", label: "Borrow" },
  { to: "/vault", label: "Vault" },
  { to: "/launch", label: "Launch" },
  { to: "/suite", label: "Suite" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const notice = useDesk((s) => s.notice);
  const clear = useDesk((s) => s.clear);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-4">
          <Link to="/" className="font-serif text-2xl tracking-tight text-gold">
            SOLOMON
          </Link>
          <nav className="flex flex-wrap gap-1">
            {LINKS.map((l) => {
              const on = path === l.to;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={
                    "px-3 py-2 text-sm " + (on ? "bg-gold text-bg" : "text-muted hover:text-fg")
                  }
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      {notice ? (
        <div className={"border-b border-line " + (notice.tone === "bad" ? "text-bad" : "text-ok")}>
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-4 py-3 text-sm">
            <p>{notice.text}</p>
            <button type="button" onClick={clear} className="text-muted">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted">
      {label}
      {children}
    </label>
  );
}

