import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Field, Shell } from "@/components/shell";
import { RATE_BUCKETS } from "@/lib/solomon/constants";
import { fmt } from "@/lib/solomon/format";
import { positionIcr, tcrBps, useDesk } from "@/lib/solomon/desk";

export const Route = createFileRoute("/borrow")({ component: Borrow });

function Borrow() {
  const cdp = useDesk((s) => s.cdp);
  const posId = useDesk((s) => s.posId);
  const open = useDesk((s) => s.open);
  const draw = useDesk((s) => s.draw);
  const setGold = useDesk((s) => s.setGold);
  const seize = useDesk((s) => s.seize);
  const poolIn = useDesk((s) => s.poolIn);
  const redeemGold = useDesk((s) => s.redeemGold);
  const [coll, setColl] = useState("10");
  const [rate, setRate] = useState("200");
  const [hedge, setHedge] = useState("8000");
  const [take, setTake] = useState("1600");
  const [usd, setUsd] = useState("1600");
  const pos = cdp.positions.find((p) => p.id === posId && p.status === "active");
  const icr = positionIcr(cdp, posId);
  const price = Number(cdp.priceE8) / 1e8;

  return (
    <Shell>
      <h1 className="font-serif text-4xl">Borrow HEDGE</h1>
      <p className="mt-2 max-w-xl text-muted">
        Deposit SOLOMON, pick a rate bucket, mint HEDGE. Minimum collateral ratio is 110%.
        If the system ratio is under 150%, a new draw must clear 150%. A trove under 110% can be liquidated into the stability pool.
      </p>
      <div className="mt-6 grid gap-px bg-line sm:grid-cols-4">
        <Cell k="Gold mark" v={`$${price.toFixed(0)}`} />
        <Cell k="Your collateral" v={fmt(cdp.collBalances.you ?? 0n, 2)} />
        <Cell k="Your HEDGE" v={fmt(cdp.hedgeBalances.you ?? 0n, 2)} />
        <Cell k="TCR" v={tcrBps(cdp) === 0n ? "—" : `${tcrBps(cdp)} bps`} />
      </div>
      <form
        className="mt-8 grid gap-4 border border-line bg-surface p-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          open(Number(coll), Number(rate));
        }}
      >
        <Field label="SOLOMON collateral">
          <input value={coll} onChange={(e) => setColl(e.target.value)} className="desk-num border border-line bg-bg px-3 py-3" />
        </Field>
        <Field label="Rate bucket, bps">
          <select value={rate} onChange={(e) => setRate(e.target.value)} className="border border-line bg-bg px-3 py-3">
            {RATE_BUCKETS.map((r) => (
              <option key={String(r)} value={String(r)}>{String(r)}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <button className="bg-gold px-4 py-3 text-bg" type="submit">Open trove</button>
        </div>
      </form>
      {pos ? (
        <div className="mt-4 border border-line p-4">
          <p className="text-sm text-muted">Trove {pos.id}</p>
          <p className="desk-num mt-1 text-gold">
            {fmt(pos.coll, 2)} SOLOMON · debt {fmt(pos.debt, 2)} · ICR {icr?.toString() ?? "—"} bps
          </p>
          <form
            className="mt-4 flex flex-wrap gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              draw(Number(hedge));
            }}
          >
            <input value={hedge} onChange={(e) => setHedge(e.target.value)} className="desk-num border border-line bg-bg px-3 py-3" />
            <button className="bg-gold px-4 py-3 text-bg" type="submit">Draw HEDGE</button>
            <button type="button" onClick={poolIn} className="border border-line px-4 py-3">Pool the HEDGE</button>
            <button type="button" onClick={seize} className="border border-bad px-4 py-3 text-bad">Liquidate</button>
          </form>
          <form
            className="mt-3 flex flex-wrap gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              redeemGold(Number(take));
            }}
          >
            <input value={take} onChange={(e) => setTake(e.target.value)} className="desk-num border border-line bg-bg px-3 py-3" />
            <button className="border border-line px-4 py-3" type="submit">Redeem HEDGE for gold</button>
          </form>
        </div>
      ) : null}
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setGold(Number(usd));
        }}
      >
        <Field label="Set gold price, USD per token">
          <input value={usd} onChange={(e) => setUsd(e.target.value)} className="desk-num border border-line bg-surface px-3 py-3" />
        </Field>
        <button className="border border-line px-4 py-3" type="submit">Mark</button>
      </form>
    </Shell>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-bg px-4 py-4">
      <p className="text-sm text-muted">{k}</p>
      <p className="desk-num mt-1 text-xl text-gold">{v}</p>
    </div>
  );
}
