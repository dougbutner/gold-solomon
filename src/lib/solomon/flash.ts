import { BPS, FLASH_FEE_BPS } from "./constants.ts";

export type FlashBook = {
  reserves: Record<string, bigint>;
  fees: Record<string, bigint>;
};

/** Same-tx flash. SOLOMON is the flex quote, so its fee is 0. Other assets pay 3 bps. */
export function flashFee(asset: string, amount: bigint): bigint {
  if (asset === "SOLOMON") return 0n;
  return (amount * FLASH_FEE_BPS) / BPS;
}

export function flash(
  book: FlashBook,
  asset: string,
  amount: bigint,
  repay: (borrowed: bigint, due: bigint) => bigint,
): { fee: bigint; repaid: bigint } {
  const reserve = book.reserves[asset] ?? 0n;
  if (amount <= 0n || amount > reserve) throw new Error("reserve");
  const fee = flashFee(asset, amount);
  const due = amount + fee;
  book.reserves[asset] = reserve - amount;
  const back = repay(amount, due);
  if (back < due) {
    book.reserves[asset] = reserve;
    throw new Error("flash not repaid");
  }
  book.reserves[asset] = (book.reserves[asset] ?? 0n) + due;
  book.fees[asset] = (book.fees[asset] ?? 0n) + fee;
  return { fee, repaid: due };
}

/** Half the deposit stays locked. Half becomes partner stake weight, in SOLOMON units. */
export function halfLoan(amount: bigint): { locked: bigint; earning: bigint } {
  if (amount <= 0n) throw new Error("amount");
  const locked = amount / 2n;
  return { locked, earning: amount - locked };
}
