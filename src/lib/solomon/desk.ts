import { create } from "zustand";
import { MG_PER_TOKEN, UNIT } from "./constants.ts";
import {
  borrow,
  depositSp,
  emptyCdp,
  icrBps,
  liquidate,
  openPosition,
  redeem,
  setPrice,
  tcrBps,
  type CdpState,
} from "./cdp.ts";
import { curveBuy, gramsBacked, makeItRain, openLaunch, setFees, type LaunchState } from "./curve.ts";
import { flash, type FlashBook, halfLoan } from "./flash.ts";
import { claimPartner, emptyBook, pendingPartner, stakePartner, transferSolomon, type SolomonBook } from "./solomon.ts";

const u = (n: number) => BigInt(Math.round(n * 1_000_000));

export type Notice = { tone: "ok" | "bad"; text: string };

type Desk = {
  book: SolomonBook;
  cdp: CdpState;
  launch: LaunchState;
  posId: number | null;
  notice: Notice | null;
  transfer: (amount: number) => void;
  stake: (amount: number) => void;
  claim: () => void;
  open: (coll: number, rate: number) => void;
  draw: (hedge: number) => void;
  setGold: (usd: number) => void;
  seize: () => void;
  poolIn: () => void;
  buyCurve: (sol: number) => void;
  rain: () => void;
  redeemGold: (hedge: number) => void;
  lockHalf: (amount: number) => void;
  tryFlash: (asset: "SOLOMON" | "USDC", amount: number, repay: boolean) => void;
  clear: () => void;
  flashBook: FlashBook;
  locked: bigint;
};

function freshLaunch(): LaunchState {
  const launch = openLaunch(UNIT, 4n * UNIT, true);
  setFees(launch, 100n, 0n, 100n);
  return launch;
}

export const useDesk = create<Desk>((set, get) => ({
  book: emptyBook({ you: 1_000n * UNIT, partner: 4n * UNIT, treasury: 5_000_000n * UNIT }),
  cdp: (() => {
    const cdp = emptyCdp(1_600n * 100_000_000n);
    cdp.collBalances.you = 100n * UNIT;
    return cdp;
  })(),
  launch: freshLaunch(),
  flashBook: { reserves: { SOLOMON: 1_000n * UNIT, USDC: 1_000n * UNIT }, fees: { SOLOMON: 0n, USDC: 0n } },
  locked: 0n,
  posId: null,
  notice: null,
  clear: () => set({ notice: null }),
  transfer: (amount) => {
    const book = structuredClone(get().book);
    try {
      const moved = transferSolomon(book, "you", "market", u(amount));
      set({
        book,
        notice: {
          tone: "ok",
          text: `Sent ${amount}. Tax ${Number(moved.tax) / 1e6}, partner half ${Number(moved.partner) / 1e6}, buyback ${Number(moved.buyback) / 1e6}.`,
        },
      });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "transfer failed" } });
    }
  },
  stake: (amount) => {
    const book = structuredClone(get().book);
    try {
      stakePartner(book, "you", u(amount));
      set({ book, notice: { tone: "ok", text: `Staked ${amount} SOLOMON. Partner weight updates on the next tax.` } });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "stake failed" } });
    }
  },
  claim: () => {
    const book = structuredClone(get().book);
    try {
      const got = claimPartner(book, "you");
      set({ book, notice: { tone: "ok", text: `Claimed ${Number(got) / 1e6} SOLOMON from the partner half.` } });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "claim failed" } });
    }
  },
  open: (coll, rate) => {
    const cdp = structuredClone(get().cdp);
    try {
      const pos = openPosition(cdp, "you", u(coll), BigInt(rate));
      set({ cdp, posId: pos.id, notice: { tone: "ok", text: `Trove ${pos.id} opened with ${coll} SOLOMON at ${rate / 100}% .` } });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "open failed" } });
    }
  },
  draw: (hedge) => {
    const cdp = structuredClone(get().cdp);
    const id = get().posId;
    if (id == null) {
      set({ notice: { tone: "bad", text: "Open a trove first." } });
      return;
    }
    try {
      const out = borrow(cdp, id, u(hedge));
      set({
        cdp,
        notice: { tone: "ok", text: `Drew ${hedge} HEDGE. Fee ${Number(out.fee) / 1e6}. Debt ${Number(out.debt) / 1e6}.` },
      });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "borrow failed" } });
    }
  },
  setGold: (usd) => {
    const cdp = structuredClone(get().cdp);
    setPrice(cdp, BigInt(Math.round(usd * 100_000_000)));
    set({ cdp, notice: { tone: "ok", text: `Gold mark set to $${usd}.` } });
  },
  seize: () => {
    const cdp = structuredClone(get().cdp);
    const id = get().posId;
    if (id == null) return;
    try {
      const liq = liquidate(cdp, id);
      set({
        cdp,
        posId: null,
        notice: { tone: "ok", text: `Liquidated. Stability pool offset ${Number(liq.offset) / 1e6} HEDGE.` },
      });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "liquidate failed" } });
    }
  },
  poolIn: () => {
    const cdp = structuredClone(get().cdp);
    const bal = cdp.hedgeBalances.you ?? 0n;
    if (bal === 0n) {
      set({ notice: { tone: "bad", text: "No HEDGE to deposit." } });
      return;
    }
    try {
      depositSp(cdp, "you", bal);
      set({ cdp, notice: { tone: "ok", text: "HEDGE deposited to the stability pool." } });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "pool failed" } });
    }
  },
  buyCurve: (sol) => {
    const launch = structuredClone(get().launch);
    const book = structuredClone(get().book);
    try {
      const quote = u(sol);
      const bal = book.balances.you ?? 0n;
      if (bal < quote) throw new Error("not enough SOLOMON");
      book.balances.you = bal - quote;
      const buy = curveBuy(launch, "you", quote);
      const mg = gramsBacked(launch.realQuote + launch.poolQuote, MG_PER_TOKEN);
      set({
        launch,
        book,
        notice: {
          tone: "ok",
          text: `Bought ${Number(buy.tokensOut) / 1e6} launch tokens. Curve holds ${(Number(mg) / 1000).toFixed(3)} g gold.`,
        },
      });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "buy failed" } });
    }
  },
  rain: () => {
    const launch = structuredClone(get().launch);
    try {
      const rain = makeItRain(launch, 20);
      set({ launch, notice: { tone: "ok", text: `Rain paid ${Number(rain.paid) / 1e6} of splash ${Number(rain.splash) / 1e6}.` } });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "rain failed" } });
    }
  },
  redeemGold: (hedge) => {
    const cdp = structuredClone(get().cdp);
    try {
      const out = redeem(cdp, "you", u(hedge));
      set({
        cdp,
        notice: {
          tone: "ok",
          text: `Redeemed ${hedge} HEDGE. Gold out ${Number(out.collOut) / 1e6}. Fee ${Number(out.fee) / 1e6}.`,
        },
      });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "redeem failed" } });
    }
  },
  lockHalf: (amount) => {
    const book = structuredClone(get().book);
    try {
      const parts = halfLoan(u(amount));
      const bal = book.balances.you ?? 0n;
      if (bal < u(amount)) throw new Error("insufficient SOLOMON");
      book.balances.you = bal - parts.locked;
      stakePartner(book, "you", parts.earning);
      set({
        book,
        locked: get().locked + parts.locked,
        notice: {
          tone: "ok",
          text: `Half-lock ${Number(parts.locked) / 1e6} SOLOMON. Partner stake ${Number(parts.earning) / 1e6}.`,
        },
      });
    } catch (error) {
      set({ notice: { tone: "bad", text: error instanceof Error ? error.message : "half-lock failed" } });
    }
  },
  tryFlash: (asset, amount, repay) => {
    const flashBook = structuredClone(get().flashBook);
    const before = flashBook.reserves[asset] ?? 0n;
    try {
      const out = flash(flashBook, asset, u(amount), (_borrowed, due) => (repay ? due : 0n));
      set({
        flashBook,
        notice: {
          tone: "ok",
          text: `${asset} flash fee ${Number(out.fee) / 1e6}. Reserve ${Number(flashBook.reserves[asset] ?? 0n) / 1e6}.`,
        },
      });
    } catch (error) {
      const restored = (flashBook.reserves[asset] ?? 0n) === before;
      set({
        flashBook,
        notice: {
          tone: "bad",
          text: `${error instanceof Error ? error.message : "flash failed"}. Reserve ${restored ? "restored" : "changed"}.`,
        },
      });
    }
  },
}));

export function youSolomon(book: SolomonBook): bigint {
  return book.balances.you ?? 0n;
}

export function youPending(book: SolomonBook): bigint {
  return pendingPartner(book, "you");
}

export function positionIcr(cdp: CdpState, id: number | null): bigint | null {
  if (id == null) return null;
  const pos = cdp.positions.find((p) => p.id === id && p.status === "active");
  if (!pos) return null;
  return icrBps(pos.coll, pos.debt, cdp.priceE8);
}

export { tcrBps };
