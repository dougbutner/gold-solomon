import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { CHAINS, SOLOMON_MINT } from "@/lib/solomon/constants";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <Shell>
      <p className="text-xs tracking-widest text-gold">GOLD.COM.VC</p>
      <h1 className="mt-3 max-w-xl font-serif text-5xl leading-none text-fg sm:text-6xl">
        Gold that adds volatility
      </h1>
      <p className="mt-4 max-w-xl text-muted">
        One SOLOMON is 11.4 grams of gold. Transfers pay 2%. Partners split half of that tax.
        The other half buys the book back. Hedgewaters borrows HEDGE against it, half-locks a deposit, and flashes SOLOMON at no fee.
        Flex launches quote it, and the rain pays it.
      </p>
      <dl className="mt-8 grid gap-px bg-line sm:grid-cols-4">
        {[
          ["50%", "Revenue to partners"],
          ["11.4 g", "Physical gold per token"],
          ["2%", "Transfer tax"],
          ["382/1000", "Flex rain each call"],
        ].map(([n, l]) => (
          <div key={l} className="bg-surface px-4 py-5">
            <dt className="desk-num font-serif text-3xl text-gold">{n}</dt>
            <dd className="mt-1 text-sm text-muted">{l}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-10">
        <h2 className="font-serif text-2xl">Canonical mint</h2>
        <p className="mt-2 break-all font-mono text-sm text-gold">{SOLOMON_MINT}</p>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Solana holds the token. The other chains are where this desk deploys the same
          rules against bridged SOLOMON. They are targets, not live contracts.
        </p>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-2 font-normal">Chain</th>
              <th className="py-2 font-normal">Status</th>
              <th className="py-2 font-normal">What lands there</th>
            </tr>
          </thead>
          <tbody>
            {CHAINS.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="py-3 pr-3 align-top">{c.label}</td>
                <td className="py-3 pr-3 align-top text-gold">{c.status}</td>
                <td className="py-3 align-top break-all text-muted">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/borrow" className="bg-gold px-4 py-3 text-sm text-bg">
          Borrow against gold
        </Link>
        <Link to="/vault" className="border border-line px-4 py-3 text-sm">
          Half-lock and flash
        </Link>
        <Link to="/suite" className="border border-line px-4 py-3 text-sm">
          Read the math suite
        </Link>
      </div>
    </Shell>
  );
}
