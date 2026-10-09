import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Field, Shell } from "@/components/shell";
import { fmt } from "@/lib/solomon/format";
import { useDesk } from "@/lib/solomon/desk";

export const Route = createFileRoute("/vault")({ component: Vault });

function Vault() {
  const locked = useDesk((s) => s.locked);
  const stake = useDesk((s) => s.book.partners.find((p) => p.id === "you")?.stake ?? 0n);
  const flashBook = useDesk((s) => s.flashBook);
  const lockHalf = useDesk((s) => s.lockHalf);
  const tryFlash = useDesk((s) => s.tryFlash);
  const [amount, setAmount] = useState("10");
  const [flashAmt, setFlashAmt] = useState("100");
  const [asset, setAsset] = useState<"SOLOMON" | "USDC">("SOLOMON");

  return (
    <Shell>
      <h1 className="font-serif text-4xl">Vault</h1>
      <p className="mt-2 max-w-xl text-muted">
        Half of a deposit stays locked. The other half is partner stake, so it earns the partner side of the 2% tax.
        A flash of SOLOMON is free, because it is the quote. Any other asset pays 3 basis points, and an unpaid flash puts the reserve back.
      </p>
      <div className="mt-6 grid gap-px bg-line sm:grid-cols-3">
        <Stat label="Locked SOLOMON" value={fmt(locked, 2)} sub="Does not move" />
        <Stat label="Partner stake from locks" value={fmt(stake, 2)} sub="Earning half" />
        <Stat label={`${asset} reserve`} value={fmt(flashBook.reserves[asset] ?? 0n, 4)} sub={`Fees kept ${fmt(flashBook.fees[asset] ?? 0n, 4)}`} />
      </div>
      <form
        className="mt-8 grid gap-4 border border-line bg-surface p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          lockHalf(Number(amount));
        }}
      >
        <Field label="Half-lock SOLOMON">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="desk-num border border-line bg-bg px-3 py-3 text-fg" />
        </Field>
        <div className="flex items-end">
          <button type="submit" className="bg-gold px-4 py-3 text-bg">Lock half, stake half</button>
        </div>
      </form>
      <form
        className="mt-4 grid gap-4 border border-line bg-surface p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          tryFlash(asset, Number(flashAmt), true);
        }}
      >
        <Field label="Flash amount">
          <input value={flashAmt} onChange={(e) => setFlashAmt(e.target.value)} className="desk-num border border-line bg-bg px-3 py-3 text-fg" />
        </Field>
        <Field label="Asset">
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value === "USDC" ? "USDC" : "SOLOMON")}
            className="border border-line bg-bg px-3 py-3 text-fg"
          >
            <option value="SOLOMON">SOLOMON, fee 0</option>
            <option value="USDC">USDC, fee 3 bps</option>
          </select>
        </Field>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button type="submit" className="bg-gold px-4 py-3 text-bg">Flash and repay</button>
          <button
            type="button"
            className="border border-bad px-4 py-3 text-bad"
            onClick={() => tryFlash(asset, Number(flashAmt), false)}
          >
            Flash and fail
          </button>
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
