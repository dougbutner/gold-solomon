import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Field, Shell } from "@/components/shell";
import { fmt } from "@/lib/solomon/format";
import { gramsMilli } from "@/lib/solomon/solomon";
import { useDesk, youPending, youSolomon } from "@/lib/solomon/desk";

export const Route = createFileRoute("/partners")({ component: Partners });

function Partners() {
  const book = useDesk((s) => s.book);
  const transfer = useDesk((s) => s.transfer);
  const stake = useDesk((s) => s.stake);
  const claim = useDesk((s) => s.claim);
  const [send, setSend] = useState("100");
  const [lock, setLock] = useState("10");
  const you = youSolomon(book);
  const youStake = book.partners.find((p) => p.id === "you")?.stake ?? 0n;

  return (
    <Shell>
      <h1 className="font-serif text-4xl">Partners</h1>
      <p className="mt-2 max-w-xl text-muted">
        A transfer of SOLOMON keeps 98% for the recipient. One percent goes to partner stake.
        One percent sits in the buyback pot. Curve, locker, and hook transfers are exempt.
      </p>
      <div className="mt-6 grid gap-px bg-line sm:grid-cols-3">
        <Stat label="Your SOLOMON" value={fmt(you, 2)} sub={`${gramsMilli(you)} mg gold`} />
        <Stat label="Your stake" value={fmt(youStake, 2)} sub={`Claimable ${fmt(youPending(book), 4)}`} />
        <Stat label="Buyback pot" value={fmt(book.buybackPot, 4)} sub={`Tax collected ${fmt(book.taxCollected, 4)}`} />
      </div>
      <form
        className="mt-8 grid gap-4 border border-line bg-surface p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          transfer(Number(send));
        }}
      >
        <Field label="Transfer SOLOMON">
          <input value={send} onChange={(e) => setSend(e.target.value)} className="desk-num border border-line bg-bg px-3 py-3 text-fg" />
        </Field>
        <div className="flex items-end">
          <button type="submit" className="bg-gold px-4 py-3 text-bg">Pay the 2%</button>
        </div>
      </form>
      <form
        className="mt-4 grid gap-4 border border-line bg-surface p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          stake(Number(lock));
        }}
      >
        <Field label="Stake as partner">
          <input value={lock} onChange={(e) => setLock(e.target.value)} className="desk-num border border-line bg-bg px-3 py-3 text-fg" />
        </Field>
        <div className="flex items-end gap-3">
          <button type="submit" className="bg-gold px-4 py-3 text-bg">Stake</button>
          <button type="button" onClick={claim} className="border border-line px-4 py-3">Claim</button>
        </div>
      </form>
    </Shell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-bg px-4 py-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="desk-num mt-1 font-serif text-3xl text-gold">{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}
