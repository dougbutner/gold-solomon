import {
  BORROW_FEE_BPS,
  BPS,
  CCR_BPS,
  INDEX_SCALE,
  MCR_BPS,
  P_MIN,
  RATE_BUCKETS,
  REDEEM_FEE_BPS,
  SECONDS_YEAR,
} from "./constants.ts";

export type Position = {
  id: number;
  owner: string;
  coll: bigint;
  debt: bigint;
  rateBps: bigint;
  lastAccrue: bigint;
  status: "active" | "closed";
};

export type SpDeposit = {
  owner: string;
  hedge: bigint;
  snapP: bigint;
  snapS: bigint;
  snapG: bigint;
  claimedColl: bigint;
  claimedYield: bigint;
};

export type CdpState = {
  now: bigint;
  priceE8: bigint;
  positions: Position[];
  nextId: number;
  spHedge: bigint;
  spP: bigint;
  spS: bigint;
  spG: bigint;
  spEpoch: number;
  deposits: SpDeposit[];
  hedgeBalances: Record<string, bigint>;
  collBalances: Record<string, bigint>;
  surplus: Record<string, bigint>;
  hedgeSupply: bigint;
  /** Debt a liquidation could not offset or burn. Must stay zero in the checked path. */
  badDebt: bigint;
};

export function emptyCdp(priceE8: bigint, now = 0n): CdpState {
  return {
    now,
    priceE8,
    positions: [],
    nextId: 1,
    spHedge: 0n,
    spP: INDEX_SCALE,
    spS: 0n,
    spG: 0n,
    spEpoch: 0,
    deposits: [],
    hedgeBalances: {},
    collBalances: {},
    surplus: {},
    hedgeSupply: 0n,
    badDebt: 0n,
  };
}

export function validRate(rate: bigint): boolean {
  return (RATE_BUCKETS as readonly bigint[]).includes(rate);
}

/** USD value of collateral in 6-decimal units. priceE8 is USD per 1.0 token * 1e8. */
export function collUsd(coll: bigint, priceE8: bigint): bigint {
  return (coll * priceE8) / 100_000_000n;
}

export function icrBps(coll: bigint, debt: bigint, priceE8: bigint): bigint {
  if (debt === 0n) return coll === 0n ? 0n : 10n ** 12n;
  return (collUsd(coll, priceE8) * BPS) / debt;
}

export function tcrBps(state: CdpState): bigint {
  let coll = 0n;
  let debt = 0n;
  for (const p of state.positions) {
    if (p.status !== "active") continue;
    coll += p.coll;
    debt += p.debt;
  }
  return icrBps(coll, debt, state.priceE8);
}

function mint(state: CdpState, to: string, amount: bigint): void {
  if (amount <= 0n) return;
  state.hedgeBalances[to] = (state.hedgeBalances[to] ?? 0n) + amount;
  state.hedgeSupply += amount;
}

function burn(state: CdpState, from: string, amount: bigint): void {
  const bal = state.hedgeBalances[from] ?? 0n;
  if (bal < amount) throw new Error("insufficient HEDGE");
  state.hedgeBalances[from] = bal - amount;
  state.hedgeSupply -= amount;
}

function accrue(state: CdpState, pos: Position): bigint {
  if (pos.status !== "active" || pos.debt === 0n) {
    pos.lastAccrue = state.now;
    return 0n;
  }
  const dt = state.now - pos.lastAccrue;
  if (dt < 0n) throw new Error("clock moved backwards");
  const interest = (pos.debt * pos.rateBps * dt) / (BPS * SECONDS_YEAR);
  pos.lastAccrue = state.now;
  if (interest === 0n) return 0n;
  pos.debt += interest;
  payYieldToSp(state, interest);
  mint(state, "stability-pool", interest);
  return interest;
}

function payYieldToSp(state: CdpState, interest: bigint): void {
  if (state.spHedge === 0n || interest === 0n) return;
  state.spG += (interest * state.spP) / state.spHedge;
}

function requireHealthy(state: CdpState, coll: bigint, debt: bigint): void {
  const icr = icrBps(coll, debt, state.priceE8);
  const tcr = tcrBps(state);
  const floor = tcr < CCR_BPS ? CCR_BPS : MCR_BPS;
  if (icr < floor) throw new Error(`ICR ${icr} below ${floor}`);
}

export function openPosition(state: CdpState, owner: string, coll: bigint, rateBps: bigint): Position {
  if (!validRate(rateBps)) throw new Error("rate bucket");
  if (coll <= 0n) throw new Error("coll");
  const bal = state.collBalances[owner] ?? 0n;
  if (bal < coll) throw new Error("insufficient SOLOMON collateral");
  state.collBalances[owner] = bal - coll;
  const pos: Position = {
    id: state.nextId++,
    owner,
    coll,
    debt: 0n,
    rateBps,
    lastAccrue: state.now,
    status: "active",
  };
  state.positions.push(pos);
  return pos;
}

export function borrow(state: CdpState, posId: number, hedgeOut: bigint): { fee: bigint; debt: bigint } {
  const pos = requirePos(state, posId);
  accrue(state, pos);
  if (hedgeOut <= 0n) throw new Error("amount");
  const fee = (hedgeOut * BORROW_FEE_BPS) / BPS;
  const increase = hedgeOut + fee;
  pos.debt += increase;
  requireHealthy(state, pos.coll, pos.debt);
  mint(state, pos.owner, hedgeOut);
  if (fee > 0n) {
    payYieldToSp(state, fee);
    mint(state, "stability-pool", fee);
  }
  return { fee, debt: pos.debt };
}

export function repay(state: CdpState, posId: number, amount: bigint): void {
  const pos = requirePos(state, posId);
  accrue(state, pos);
  if (amount <= 0n || amount > pos.debt) throw new Error("repay amount");
  burn(state, pos.owner, amount);
  pos.debt -= amount;
}

export function addColl(state: CdpState, posId: number, amount: bigint): void {
  const pos = requirePos(state, posId);
  const bal = state.collBalances[pos.owner] ?? 0n;
  if (bal < amount || amount <= 0n) throw new Error("coll");
  state.collBalances[pos.owner] = bal - amount;
  pos.coll += amount;
}

export function withdrawColl(state: CdpState, posId: number, amount: bigint): void {
  const pos = requirePos(state, posId);
  accrue(state, pos);
  if (amount <= 0n || amount > pos.coll) throw new Error("withdraw");
  pos.coll -= amount;
  if (pos.debt > 0n) requireHealthy(state, pos.coll, pos.debt);
  state.collBalances[pos.owner] = (state.collBalances[pos.owner] ?? 0n) + amount;
}

export function depositSp(state: CdpState, owner: string, amount: bigint): void {
  if (amount <= 0n) throw new Error("amount");
  burn(state, owner, amount);
  let d = state.deposits.find((x) => x.owner === owner);
  if (!d) {
    d = {
      owner,
      hedge: 0n,
      snapP: state.spP,
      snapS: state.spS,
      snapG: state.spG,
      claimedColl: 0n,
      claimedYield: 0n,
    };
    state.deposits.push(d);
  } else {
    claimSp(state, owner);
  }
  d.hedge += amount;
  state.spHedge += amount;
  d.snapP = state.spP;
  d.snapS = state.spS;
  d.snapG = state.spG;
}

export function spGains(state: CdpState, d: SpDeposit): { compounded: bigint; coll: bigint; yieldGain: bigint } {
  if (d.hedge === 0n || d.snapP === 0n) return { compounded: 0n, coll: 0n, yieldGain: 0n };
  const compounded = (d.hedge * state.spP) / d.snapP;
  const coll = (d.hedge * (state.spS - d.snapS)) / d.snapP;
  const yieldGain = (d.hedge * (state.spG - d.snapG)) / d.snapP;
  return { compounded, coll, yieldGain };
}

export function claimSp(state: CdpState, owner: string): { coll: bigint; yieldGain: bigint } {
  const d = state.deposits.find((x) => x.owner === owner);
  if (!d) throw new Error("no deposit");
  const g = spGains(state, d);
  d.hedge = g.compounded;
  d.snapP = state.spP;
  d.snapS = state.spS;
  d.snapG = state.spG;
  if (g.coll > 0n) {
    state.collBalances[owner] = (state.collBalances[owner] ?? 0n) + g.coll;
    d.claimedColl += g.coll;
  }
  if (g.yieldGain > 0n) {
    const bal = state.hedgeBalances["stability-pool"] ?? 0n;
    const pay = g.yieldGain > bal ? bal : g.yieldGain;
    state.hedgeBalances["stability-pool"] = bal - pay;
    state.hedgeBalances[owner] = (state.hedgeBalances[owner] ?? 0n) + pay;
    d.claimedYield += pay;
  }
  return { coll: g.coll, yieldGain: g.yieldGain };
}

function offsetSp(state: CdpState, debt: bigint, coll: bigint): void {
  if (state.spHedge === 0n) throw new Error("empty stability pool");
  const take = debt > state.spHedge ? state.spHedge : debt;
  const collShare = debt === 0n ? 0n : (coll * take) / debt;
  state.spS += (collShare * state.spP) / state.spHedge;
  const nextP = (state.spP * (state.spHedge - take)) / state.spHedge;
  state.spHedge -= take;
  const drained = state.spHedge === 0n || nextP < P_MIN;
  if (drained) {
    for (const d of state.deposits) {
      if (d.hedge === 0n || d.snapP === 0n) continue;
      const collGain = (d.hedge * (state.spS - d.snapS)) / d.snapP;
      const yieldGain = (d.hedge * (state.spG - d.snapG)) / d.snapP;
      if (collGain > 0n) state.collBalances[d.owner] = (state.collBalances[d.owner] ?? 0n) + collGain;
      if (yieldGain > 0n) {
        const bal = state.hedgeBalances["stability-pool"] ?? 0n;
        const pay = yieldGain > bal ? bal : yieldGain;
        state.hedgeBalances["stability-pool"] = bal - pay;
        state.hedgeBalances[d.owner] = (state.hedgeBalances[d.owner] ?? 0n) + pay;
      }
      d.hedge = 0n;
      d.snapP = INDEX_SCALE;
      d.snapS = 0n;
      d.snapG = 0n;
    }
    state.spEpoch += 1;
    state.spP = INDEX_SCALE;
    state.spS = 0n;
    state.spG = 0n;
    state.spHedge = 0n;
  } else {
    state.spP = nextP;
  }
}

export function liquidate(state: CdpState, posId: number): { offset: bigint; collToSp: bigint } {
  const pos = requirePos(state, posId);
  accrue(state, pos);
  const icr = icrBps(pos.coll, pos.debt, state.priceE8);
  if (icr >= MCR_BPS) throw new Error("position is healthy");
  const debt = pos.debt;
  const coll = pos.coll;
  const offset = debt > state.spHedge ? state.spHedge : debt;
  const collToSp = debt === 0n ? 0n : (coll * offset) / debt;
  if (offset > 0n) offsetSp(state, debt, coll);
  const remainderDebt = debt - offset;
  const remainderColl = coll - collToSp;
  if (remainderDebt > 0n) {
    const poolBal = state.hedgeBalances["stability-pool"] ?? 0n;
    const burnAmt = remainderDebt > poolBal ? poolBal : remainderDebt;
    if (burnAmt > 0n) {
      state.hedgeBalances["stability-pool"] = poolBal - burnAmt;
      state.hedgeSupply -= burnAmt;
    }
    state.badDebt += remainderDebt - burnAmt;
    if (remainderColl > 0n) {
      state.collBalances.stability = (state.collBalances.stability ?? 0n) + remainderColl;
    }
  } else if (remainderColl > 0n) {
    state.collBalances[pos.owner] = (state.collBalances[pos.owner] ?? 0n) + remainderColl;
  }
  pos.coll = 0n;
  pos.debt = 0n;
  pos.status = "closed";
  return { offset, collToSp };
}

export function redeem(state: CdpState, owner: string, hedgeIn: bigint): { collOut: bigint; fee: bigint } {
  if (hedgeIn <= 0n) throw new Error("amount");
  const order = state.positions
    .filter((p) => p.status === "active" && p.debt > 0n)
    .sort((a, b) => (a.rateBps < b.rateBps ? -1 : a.rateBps > b.rateBps ? 1 : a.id - b.id));
  let left = hedgeIn;
  let collGross = 0n;
  for (const pos of order) {
    if (left === 0n) break;
    accrue(state, pos);
    const take = left > pos.debt ? pos.debt : left;
    const collExact = (take * 100_000_000n) / state.priceE8;
    if (collExact > pos.coll) throw new Error("position under-collateralized for redeem");
    pos.debt -= take;
    pos.coll -= collExact;
    collGross += collExact;
    left -= take;
    if (pos.debt === 0n && pos.coll === 0n) pos.status = "closed";
  }
  if (left !== 0n) throw new Error("not enough debt to redeem");
  burn(state, owner, hedgeIn);
  const fee = (collGross * REDEEM_FEE_BPS) / BPS;
  const collOut = collGross - fee;
  state.collBalances[owner] = (state.collBalances[owner] ?? 0n) + collOut;
  state.collBalances["redeem-fee"] = (state.collBalances["redeem-fee"] ?? 0n) + fee;
  return { collOut, fee };
}

export function advance(state: CdpState, seconds: bigint): void {
  state.now += seconds;
}

function requirePos(state: CdpState, id: number): Position {
  const pos = state.positions.find((p) => p.id === id);
  if (!pos || pos.status !== "active") throw new Error("position");
  return pos;
}

export function setPrice(state: CdpState, priceE8: bigint): void {
  if (priceE8 <= 0n) throw new Error("price");
  state.priceE8 = priceE8;
}
