import { BPS, MG_PER_TOKEN, PARTNER_OF_TAX_BPS, TAX_BPS, UNIT } from "./constants.ts";

export const ACC_SCALE = 10n ** 18n;

export type Partner = {
  id: string;
  stake: bigint;
  rewardDebt: bigint;
  claimed: bigint;
};

export type SolomonBook = {
  balances: Record<string, bigint>;
  partners: Partner[];
  accPerStake: bigint;
  partnerPot: bigint;
  buybackPot: bigint;
  taxCollected: bigint;
};

export function emptyBook(seed: Record<string, bigint> = {}): SolomonBook {
  return {
    balances: { ...seed },
    partners: [],
    accPerStake: 0n,
    partnerPot: 0n,
    buybackPot: 0n,
    taxCollected: 0n,
  };
}

export function gramsMilli(tokens: bigint): bigint {
  return (tokens * MG_PER_TOKEN) / UNIT;
}

export function taxOn(amount: bigint): { tax: bigint; partner: bigint; buyback: bigint; toRecipient: bigint } {
  const tax = (amount * TAX_BPS) / BPS;
  const partner = (tax * PARTNER_OF_TAX_BPS) / BPS;
  const buyback = tax - partner;
  return { tax, partner, buyback, toRecipient: amount - tax };
}

function totalStake(book: SolomonBook): bigint {
  return book.partners.reduce((s, p) => s + p.stake, 0n);
}

/** Credit partner index. If nobody has staked, the partner half joins buybacks. */
function creditPartner(book: SolomonBook, partnerCut: bigint): void {
  const stake = totalStake(book);
  if (partnerCut === 0n) return;
  if (stake === 0n) {
    book.buybackPot += partnerCut;
    return;
  }
  book.accPerStake += (partnerCut * ACC_SCALE) / stake;
  book.partnerPot += partnerCut;
}

export function pendingPartner(book: SolomonBook, id: string): bigint {
  const p = book.partners.find((x) => x.id === id);
  if (!p || p.stake === 0n) return 0n;
  const accrued = (p.stake * book.accPerStake) / ACC_SCALE;
  return accrued > p.rewardDebt ? accrued - p.rewardDebt : 0n;
}

export function stakePartner(book: SolomonBook, id: string, amount: bigint): void {
  if (amount <= 0n) throw new Error("stake must be positive");
  const bal = book.balances[id] ?? 0n;
  if (bal < amount) throw new Error("insufficient SOLOMON to stake");
  book.balances[id] = bal - amount;
  let p = book.partners.find((x) => x.id === id);
  if (!p) {
    p = { id, stake: 0n, rewardDebt: 0n, claimed: 0n };
    book.partners.push(p);
  } else {
    const owed = pendingPartner(book, id);
    if (owed > 0n) {
      book.balances[id] = (book.balances[id] ?? 0n) + owed;
      book.partnerPot -= owed;
      p.claimed += owed;
    }
  }
  p.stake += amount;
  p.rewardDebt = (p.stake * book.accPerStake) / ACC_SCALE;
}

export function claimPartner(book: SolomonBook, id: string): bigint {
  const owed = pendingPartner(book, id);
  const p = book.partners.find((x) => x.id === id);
  if (!p) throw new Error("not a partner");
  if (owed > book.partnerPot) throw new Error("partner pot short");
  book.partnerPot -= owed;
  book.balances[id] = (book.balances[id] ?? 0n) + owed;
  p.claimed += owed;
  p.rewardDebt = (p.stake * book.accPerStake) / ACC_SCALE;
  return owed;
}

/**
 * SPL-style fee: the 2% comes out of the amount sent.
 * Recipient receives 98%. Partners and the buyback vault split the 2% in half.
 * Exempt vaults (protocol, curve, locker) move the full amount.
 */
export function transferSolomon(
  book: SolomonBook,
  from: string,
  to: string,
  amount: bigint,
  exempt = false,
): { tax: bigint; partner: bigint; buyback: bigint; received: bigint } {
  if (from === to) throw new Error("self transfer");
  if (amount <= 0n) throw new Error("amount");
  const bal = book.balances[from] ?? 0n;
  if (bal < amount) throw new Error("insufficient SOLOMON");
  if (exempt) {
    book.balances[from] = bal - amount;
    book.balances[to] = (book.balances[to] ?? 0n) + amount;
    return { tax: 0n, partner: 0n, buyback: 0n, received: amount };
  }
  const parts = taxOn(amount);
  book.balances[from] = bal - amount;
  book.balances[to] = (book.balances[to] ?? 0n) + parts.toRecipient;
  book.buybackPot += parts.buyback;
  book.taxCollected += parts.tax;
  creditPartner(book, parts.partner);
  return {
    tax: parts.tax,
    partner: parts.partner,
    buyback: parts.buyback,
    received: parts.toRecipient,
  };
}
