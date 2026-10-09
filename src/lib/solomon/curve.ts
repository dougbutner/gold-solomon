import { BPS, CURVE_FEE_BPS, PAY_DEN, PAY_NUM, UNIT } from "./constants.ts";

export const TOTAL_SUPPLY = 1_000_000_000n * UNIT;
export const CURVE_SOLD = (TOTAL_SUPPLY * 5n) / 7n;

export type FlexHolder = {
  id: string;
  balance: bigint;
  feeOptedOut: boolean;
  beneficiary: string;
  beneRate: bigint;
  angelNumber: number;
};

export type LaunchState = {
  phase: "curve" | "live";
  tokenReserve: bigint;
  realQuote: bigint;
  phantomQuote: bigint;
  graduationQuote: bigint;
  quoteReserve: bigint;
  poolToken: bigint;
  poolQuote: bigint;
  holders: FlexHolder[];
  reflection: bigint;
  burnPot: bigint;
  projectPot: bigint;
  angelPot: bigint;
  jackpotPot: bigint;
  feesSet: boolean;
  reflectionRate: bigint;
  burnRate: bigint;
  projectRate: bigint;
  angelBps: bigint;
  jackpotBps: bigint;
  cursor: number;
  goldBacked: boolean;
};

const EXEMPT = new Set(["curve", "locker", "hook", "factory"]);

export function openLaunch(phantomQuote: bigint, graduationQuote: bigint, goldBacked: boolean): LaunchState {
  return {
    phase: "curve",
    tokenReserve: CURVE_SOLD,
    realQuote: 0n,
    phantomQuote,
    graduationQuote,
    quoteReserve: 0n,
    poolToken: 0n,
    poolQuote: 0n,
    holders: [],
    reflection: 0n,
    burnPot: 0n,
    projectPot: 0n,
    angelPot: 0n,
    jackpotPot: 0n,
    feesSet: false,
    reflectionRate: 0n,
    burnRate: 0n,
    projectRate: 0n,
    angelBps: 0n,
    jackpotBps: 0n,
    cursor: 0,
    goldBacked,
  };
}

function holder(state: LaunchState, id: string): FlexHolder {
  let h = state.holders.find((x) => x.id === id);
  if (!h) {
    h = {
      id,
      balance: 0n,
      feeOptedOut: false,
      beneficiary: id,
      beneRate: BPS,
      angelNumber: 1000,
    };
    state.holders.push(h);
  }
  return h;
}

export function curveBuy(state: LaunchState, buyer: string, quoteIn: bigint): { tokensOut: bigint; fee: bigint } {
  if (state.phase !== "curve") throw new Error("not on curve");
  if (quoteIn <= 0n) throw new Error("quote");
  const fee = (quoteIn * CURVE_FEE_BPS) / BPS;
  const net = quoteIn - fee;
  const virtual = state.realQuote + state.phantomQuote;
  const k = state.tokenReserve * virtual;
  const newVirtual = virtual + net;
  const newReserve = k / newVirtual;
  const tokensOut = state.tokenReserve - newReserve;
  if (tokensOut <= 0n) throw new Error("dust buy");
  state.tokenReserve = newReserve;
  state.realQuote += net;
  state.quoteReserve += fee;
  const h = holder(state, buyer);
  h.balance += tokensOut;
  if (state.realQuote >= state.graduationQuote) graduate(state);
  return { tokensOut, fee };
}

export function graduate(state: LaunchState): void {
  if (state.phase === "live") return;
  state.poolToken = state.tokenReserve;
  state.poolQuote = state.realQuote;
  state.tokenReserve = 0n;
  state.phase = "live";
}

export function setFees(
  state: LaunchState,
  reflection: bigint,
  burn: bigint,
  project: bigint,
): void {
  const next = reflection + burn + project;
  if (next > BPS) throw new Error("fee cap");
  if (state.feesSet) {
    const prev = state.reflectionRate + state.burnRate + state.projectRate;
    if (next > prev) throw new Error("tax cannot rise");
    if (reflection < state.reflectionRate) throw new Error("reflection cannot fall");
  }
  state.reflectionRate = reflection;
  state.burnRate = burn;
  state.projectRate = project;
  state.feesSet = true;
}

export function transferLaunch(state: LaunchState, from: string, to: string, amount: bigint): bigint {
  const src = holder(state, from);
  if (src.balance < amount || amount <= 0n) throw new Error("balance");
  const exempt = EXEMPT.has(from) || src.feeOptedOut || !state.feesSet;
  if (exempt) {
    src.balance -= amount;
    holder(state, to).balance += amount;
    return 0n;
  }
  const reflection = (amount * state.reflectionRate) / BPS;
  const burn = (amount * state.burnRate) / BPS;
  const project = (amount * state.projectRate) / BPS;
  const fee = reflection + burn + project;
  if (src.balance < amount + fee) throw new Error("balance for amount plus fee");
  src.balance -= amount + fee;
  holder(state, to).balance += amount;
  const n = (reflection * state.angelBps) / BPS;
  const j = (reflection * state.jackpotBps) / BPS;
  state.angelPot += n;
  state.jackpotPot += j;
  state.reflection += reflection - n - j;
  state.burnPot += burn;
  state.projectPot += project;
  return fee;
}

export function makeItRain(state: LaunchState, limit: number): { splash: bigint; paid: bigint; holders: number } {
  if (state.phase !== "live") throw new Error("rain after graduation");
  const eligible = state.holders.filter((h) => !EXEMPT.has(h.id) && !h.feeOptedOut && h.balance > 0n);
  const supply = eligible.reduce((s, h) => s + h.balance, 0n);
  if (supply === 0n) throw new Error("no holders");
  const splash = (state.reflection * PAY_NUM) / PAY_DEN;
  if (splash === 0n) return { splash, paid: 0n, holders: 0 };
  state.reflection -= splash;
  let remaining = splash;
  let paid = 0n;
  let count = 0;
  const start = state.cursor;
  for (let n = 0; n < eligible.length && count < limit && remaining > 0n; n++) {
    const h = eligible[(start + n) % eligible.length]!;
    let share = (splash * h.balance) / supply;
    if (share > remaining) share = remaining;
    if (share === 0n) continue;
    const tree = (share * h.beneRate) / BPS;
    const hold = share - tree;
    holder(state, h.beneficiary).balance += tree;
    if (hold > 0n && h.beneficiary !== h.id) h.balance += hold;
    else if (h.beneficiary === h.id) h.balance += hold;
    remaining -= share;
    paid += share;
    count += 1;
    state.cursor = (start + n + 1) % eligible.length;
  }
  state.reflection += remaining;
  return { splash, paid, holders: count };
}

export function gramsBacked(quoteTokens: bigint, mgPerToken: bigint): bigint {
  return (quoteTokens * mgPerToken) / UNIT;
}
