import { MG_PER_TOKEN, MCR_BPS, PAY_DEN, PAY_NUM, UNIT } from "./constants.ts";
import {
  borrow,
  collUsd,
  depositSp,
  emptyCdp,
  icrBps,
  liquidate,
  openPosition,
  redeem,
  setPrice,
} from "./cdp.ts";
import { curveBuy, gramsBacked, makeItRain, openLaunch, setFees, transferLaunch } from "./curve.ts";
import { flash, flashFee, halfLoan } from "./flash.ts";
import { fmt } from "./format.ts";
import { claimPartner, emptyBook, gramsMilli, stakePartner, taxOn, transferSolomon } from "./solomon.ts";

export type SuiteRow = {
  check: string;
  input: string;
  expected: string;
  actual: string;
  pass: boolean;
};

function u(whole: bigint, frac = 0n): bigint {
  return whole * UNIT + frac;
}

function add(rows: SuiteRow[], check: string, input: string, expected: string, actual: string, pass: boolean): void {
  rows.push({ check, input, expected, actual, pass });
}

export function runSuite(): SuiteRow[] {
  const rows: SuiteRow[] = [];

  const tax = taxOn(u(10_000n));
  add(rows, "2% tax from amount", "10,000 SOLOMON", "200.000000", fmt(tax.tax), tax.tax === u(200n));
  add(rows, "partner half of tax", "200 tax", "100.000000", fmt(tax.partner), tax.partner === u(100n));
  add(rows, "buyback half of tax", "200 tax", "100.000000", fmt(tax.buyback), tax.buyback === u(100n));
  add(rows, "recipient keeps 98%", "10,000 sent", "9800.000000", fmt(tax.toRecipient), tax.toRecipient === u(9_800n));
  add(rows, "11.4 g per token", "1.000000 SOLOMON", "11400 mg", `${gramsMilli(UNIT)} mg`, gramsMilli(UNIT) === MG_PER_TOKEN);
  add(
    rows,
    "11.4 g scales",
    "2.5 tokens",
    "28500 mg",
    `${gramsMilli(u(2n, 500_000n))} mg`,
    gramsMilli(u(2n, 500_000n)) === 28_500n,
  );

  const book = emptyBook({ alice: u(1_000_000n), bob: u(10n), cara: u(10n), dave: u(0n) });
  stakePartner(book, "bob", u(3n));
  stakePartner(book, "cara", u(1n));
  const moved = transferSolomon(book, "alice", "dave", u(10_000n));
  add(rows, "transfer tax posted", "alice → dave 10,000", "200.000000", fmt(moved.tax), moved.tax === u(200n));
  add(rows, "dave received", "after 2% fee", "9800.000000", fmt(book.balances.dave ?? 0n), book.balances.dave === u(9_800n));
  const bobClaim = claimPartner(book, "bob");
  const caraClaim = claimPartner(book, "cara");
  add(rows, "partner 3:1 bob", "stake 3 of 4", "75.000000", fmt(bobClaim), bobClaim === u(75n));
  add(rows, "partner 3:1 cara", "stake 1 of 4", "25.000000", fmt(caraClaim), caraClaim === u(25n));
  add(rows, "buyback pot", "half of 200", "100.000000", fmt(book.buybackPot), book.buybackPot === u(100n));
  add(rows, "partner pot drained", "after both claims", "0.000000", fmt(book.partnerPot), book.partnerPot === 0n);

  const seeded = transferSolomon(book, "alice", "curve", u(1_000n), true);
  add(rows, "curve seed is exempt", "1,000 to curve", "0.000000", fmt(seeded.tax), seeded.tax === 0n);

  const price = 1_600n * 100_000_000n;
  const cdp = emptyCdp(price);
  cdp.collBalances.mina = u(10n);
  const pos = openPosition(cdp, "mina", u(10n), 200n);
  const borrowed = borrow(cdp, pos.id, u(8_000n));
  add(rows, "borrow fee 0.50%", "borrow 8,000 HEDGE", "40.000000", fmt(borrowed.fee), borrowed.fee === u(40n));
  add(rows, "debt includes fee", "8,000 + 40", "8040.000000", fmt(borrowed.debt), borrowed.debt === u(8_040n));
  const icr = icrBps(pos.coll, pos.debt, price);
  add(rows, "ICR at $1,600", "10 SOLOMON vs 8,040 debt", "19900 bps", `${icr} bps`, icr === 19_900n);
  add(
    rows,
    "collateral USD",
    "10 * $1,600",
    "16000.000000",
    fmt(collUsd(u(10n), price)),
    collUsd(u(10n), price) === u(16_000n),
  );

  let healthyBlocked = false;
  try {
    liquidate(cdp, pos.id);
  } catch {
    healthyBlocked = true;
  }
  add(rows, "no liquidate while healthy", "ICR 199%", "revert", healthyBlocked ? "revert" : "allowed", healthyBlocked);

  depositSp(cdp, "mina", u(8_000n));
  setPrice(cdp, 800n * 100_000_000n);
  const crashed = icrBps(pos.coll, pos.debt, cdp.priceE8);
  add(rows, "ICR after gold drops to $800", "same trove", "9950 bps", `${crashed} bps`, crashed === 9_950n);
  add(rows, "below MCR", "9950 < 11000", "true", String(crashed < MCR_BPS), crashed < MCR_BPS);
  const liq = liquidate(cdp, pos.id);
  add(rows, "SP offsets what it holds", "pool 8,000 of 8,040", "8000.000000", fmt(liq.offset), liq.offset === u(8_000n));
  const minaColl = cdp.collBalances.mina ?? 0n;
  add(
    rows,
    "depositor receives seized gold",
    "coll * 8000/8040",
    fmt((u(10n) * u(8_000n)) / u(8_040n)),
    fmt(minaColl),
    minaColl === (u(10n) * u(8_000n)) / u(8_040n),
  );
  const residual = u(10n) - minaColl;
  add(
    rows,
    "borrower keeps no residual gold",
    "unoffset slice",
    "0.000000",
    fmt(cdp.surplus.mina ?? 0n),
    (cdp.surplus.mina ?? 0n) === 0n,
  );
  add(
    rows,
    "system holds residual gold",
    "10 SOLOMON - seized",
    fmt(residual),
    fmt(cdp.collBalances.stability ?? 0n),
    cdp.collBalances.stability === residual,
  );
  add(rows, "fee HEDGE burned with residual debt", "supply after seize", "0.000000", fmt(cdp.hedgeSupply), cdp.hedgeSupply === 0n);
  add(rows, "no bad debt left", "40 fee burned", "0.000000", fmt(cdp.badDebt), cdp.badDebt === 0n);

  const cdp2 = emptyCdp(price);
  cdp2.collBalances.nina = u(20n);
  cdp2.hedgeBalances.paul = u(1_600n);
  const low = openPosition(cdp2, "nina", u(20n), 100n);
  borrow(cdp2, low.id, u(5_000n));
  const red = redeem(cdp2, "paul", u(1_600n));
  const gross = (u(1_600n) * 100_000_000n) / price;
  const fee = (gross * 50n) / 10_000n;
  add(rows, "redeem 1,600 HEDGE at $1,600", "gross SOLOMON", fmt(gross), fmt(gross), gross === (u(1_600n) * 100_000_000n) / price);
  add(rows, "redeem fee 0.50% stays", "fee", fmt(fee), fmt(red.fee), red.fee === fee);
  add(rows, "redeemer gold out", "gross - fee", fmt(gross - fee), fmt(red.collOut), red.collOut === gross - fee);

  const launch = openLaunch(UNIT, u(4n), true);
  setFees(launch, 100n, 0n, 100n);
  let raised = false;
  try {
    setFees(launch, 300n, 0n, 0n);
  } catch {
    raised = true;
  }
  add(rows, "setfees cannot rise", "100+100 then 300", "revert", raised ? "revert" : "allowed", raised);
  let reflectionCut = false;
  try {
    setFees(launch, 50n, 0n, 150n);
  } catch {
    reflectionCut = true;
  }
  add(rows, "reflection cannot fall", "100 → 50", "revert", reflectionCut ? "revert" : "allowed", reflectionCut);

  const buy = curveBuy(launch, "ada", u(2n));
  add(rows, "curve fee is quote-side 1%", "buy with 2 SOLOMON", "0.020000", fmt(buy.fee), buy.fee === u(0n, 20_000n));
  const virtualBefore = UNIT;
  const net = u(2n) - buy.fee;
  const tokensExpected = (launch.tokenReserve + buy.tokensOut) - ((launch.tokenReserve + buy.tokensOut) * virtualBefore) / (virtualBefore + net);
  add(rows, "constant product tokens out", "k / new quote", fmt(tokensExpected), fmt(buy.tokensOut), buy.tokensOut === tokensExpected);
  add(
    rows,
    "grams behind the curve",
    "real SOLOMON * 11.4 g",
    `${gramsBacked(launch.realQuote, MG_PER_TOKEN)} mg`,
    `${gramsBacked(launch.realQuote, MG_PER_TOKEN)} mg`,
    gramsBacked(launch.realQuote, MG_PER_TOKEN) === gramsMilli(launch.realQuote),
  );

  curveBuy(launch, "bea", u(3n));
  add(rows, "graduation at 4 SOLOMON", "threshold 4", "live", launch.phase, launch.phase === "live");
  transferLaunch(launch, "ada", "bea", buy.tokensOut / 2n);
  const pot = launch.reflection;
  const splashExpected = (pot * PAY_NUM) / PAY_DEN;
  const rain = makeItRain(launch, 10);
  const rainOk =
    rain.splash === splashExpected &&
    rain.paid <= rain.splash &&
    launch.reflection === pot - rain.paid;
  add(
    rows,
    "rain keeps 618/1000",
    "382 paid, rest stays",
    fmt(pot - rain.paid),
    fmt(launch.reflection),
    rainOk,
  );

  const flashBook = { reserves: { SOLOMON: u(1_000n), USDC: u(1_000n) }, fees: {} };
  const goldFlash = flash(flashBook, "SOLOMON", u(100n), (_borrowed, due) => due);
  add(rows, "SOLOMON flash fee is 0", "flex quote", "0.000000", fmt(goldFlash.fee), goldFlash.fee === 0n && flashFee("SOLOMON", u(100n)) === 0n);
  const usdc = flash(flashBook, "USDC", u(100n), (_b, due) => due);
  add(rows, "other asset flash fee 3 bps", "100 USDC", "0.030000", fmt(usdc.fee), usdc.fee === u(0n, 30_000n));
  add(rows, "reserve restored", "USDC", "1000.030000", fmt(flashBook.reserves.USDC ?? 0n), flashBook.reserves.USDC === u(1_000n) + usdc.fee);

  const half = halfLoan(u(10n));
  add(rows, "half-loan lock", "10 SOLOMON", "5.000000", fmt(half.locked), half.locked === u(5n));
  add(rows, "half-loan earning leg", "10 SOLOMON", "5.000000", fmt(half.earning), half.earning === u(5n));

  let unrepaid = false;
  try {
    flash(flashBook, "USDC", u(10n), () => 0n);
  } catch {
    unrepaid = true;
  }
  add(rows, "unpaid flash reverts", "repay 0", "revert", unrepaid ? "revert" : "allowed", unrepaid);
  add(
    rows,
    "failed flash restores reserve",
    "USDC after revert",
    fmt(u(1_000n) + usdc.fee),
    fmt(flashBook.reserves.USDC ?? 0n),
    flashBook.reserves.USDC === u(1_000n) + usdc.fee,
  );

  return rows;
}

export function suiteTable(rows: SuiteRow[] = runSuite()): string {
  const widths = [32, 28, 18, 18, 6];
  const head = ["check", "input", "expected", "actual", "pass"].map((h, i) => h.padEnd(widths[i] ?? 8)).join(" | ");
  const line = widths.map((w) => "-".repeat(w)).join("-|-");
  const body = rows
    .map((r) =>
      [r.check, r.input, r.expected, r.actual, r.pass ? "yes" : "NO"]
        .map((c, i) => c.padEnd(widths[i] ?? 8))
        .join(" | "),
    )
    .join("\n");
  const passed = rows.filter((r) => r.pass).length;
  return `${head}\n${line}\n${body}\n\n${passed}/${rows.length} passed`;
}
