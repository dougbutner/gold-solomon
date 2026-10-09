import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Field, Shell } from "@/components/shell";
import { MG_PER_TOKEN } from "@/lib/solomon/constants";
import { gramsBacked } from "@/lib/solomon/curve";
import { fmt } from "@/lib/solomon/format";
import { useDesk } from "@/lib/solomon/desk";

export const Route = createFileRoute("/launch")({ component: LaunchPage });

function LaunchPage() {
  const launch = useDesk((s) => s.launch);
  const buyCurve = useDesk((s) => s.buyCurve);
  const rain = useDesk((s) => s.rain);
  const [sol, setSol] = useState("1");
  const quote = launch.phase === "live" ? launch.poolQuote : launch.realQuote;
  const you = launch.holders.find((h) => h.id === "you");

  return (
    <Shell>
      <h1 className="font-serif text-4xl">Launch against gold</h1>
      <p className="mt-2 max-w-xl text-muted">
        The curve is quoted in SOLOMON, not a stock token. Fees on the quote are 1%.
        After graduation the same token takes a FlexForex transfer tax that cannot rise,
        and reflection cannot fall. Make it rain pays 382/1000 of the reflection pot.
      </p>
      <div className="mt-6 grid gap-px bg-line sm:grid-cols-3">
        <div className="bg-surface px-4 py-5">
          <p className="text-sm text-muted">Phase</p>
          <p className="mt-1 font-serif text-3xl text-gold">{launch.phase}</p>
        </div>
        <div className="bg-surface px-4 py-5">
          <p className="text-sm text-muted">SOLOMON in the book</p>
          <p className="desk-num mt-1 font-serif text-3xl text-gold">{fmt(quote, 4)}</p>
        </div>
        <div className="bg-surface px-4 py-5">
          <p className="text-sm text-muted">Gold behind it</p>
          <p className="desk-num mt-1 font-serif text-3xl text-gold">
            {(Number(gramsBacked(quote, MG_PER_TOKEN)) / 1000).toFixed(3)} g
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">
        Your launch tokens {fmt(you?.balance ?? 0n, 2)}. Reflection pot {fmt(launch.reflection, 2)}.
      </p>
      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          buyCurve(Number(sol));
        }}
      >
        <Field label="Buy with SOLOMON">
          <input value={sol} onChange={(e) => setSol(e.target.value)} className="desk-num border border-line bg-surface px-3 py-3" />
        </Field>
        <button className="bg-gold px-4 py-3 text-bg" type="submit" disabled={launch.phase === "live"}>
          Buy on the curve
        </button>
        <button type="button" onClick={rain} className="border border-line px-4 py-3" disabled={launch.phase !== "live"}>
          Make it rain
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">Graduation threshold is 4 SOLOMON of real quote.</p>
    </Shell>
  );
}
