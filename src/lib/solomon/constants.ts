/** Integer spec shared by the desk and the suite. No floats. */

export const SOLOMON_MINT = "GoLDEDmbque3qd1xfmnzMtg7HMju8p4UoaRX1vBsehjA";

/** 11.4 grams, stored as milligrams so 1 token = 11400 mg. */
export const MG_PER_TOKEN = 11_400n;

export const DECIMALS = 6;
export const UNIT = 1_000_000n;

export const TAX_BPS = 200n;
export const PARTNER_OF_TAX_BPS = 5_000n;
export const BPS = 10_000n;

export const PAY_NUM = 382n;
export const PAY_DEN = 1_000n;

export const INDEX_SCALE = 1_000_000_000_000n;
export const P_MIN = INDEX_SCALE / 1_000_000n;
export const SECONDS_YEAR = 31_536_000n;

export const MCR_BPS = 11_000n;
export const CCR_BPS = 15_000n;
export const BORROW_FEE_BPS = 50n;
export const REDEEM_FEE_BPS = 50n;
export const FLASH_FEE_BPS = 3n;
export const CURVE_FEE_BPS = 100n;

export const RATE_BUCKETS = [50n, 100n, 200n, 400n, 600n, 1_000n] as const;

export type ChainId = "solana" | "ethereum" | "base" | "bnb" | "robinhood";

export type ChainTarget = {
  id: ChainId;
  label: string;
  status: "live" | "target";
  note: string;
};

/** Solana holds the canonical mint. Other rows are deploy targets, not live contracts. */
export const CHAINS: ChainTarget[] = [
  {
    id: "solana",
    label: "Solana",
    status: "live",
    note: "Canonical SOLOMON mint. 1 token = 11.4 g gold.",
  },
  {
    id: "ethereum",
    label: "Ethereum",
    status: "target",
    note: "HEDGE CDP + Flex launcher quoted in bridged SOLOMON.",
  },
  {
    id: "base",
    label: "Base",
    status: "target",
    note: "Same CDP and launcher. Quote stays SOLOMON, not a stock token.",
  },
  {
    id: "bnb",
    label: "BNB Chain",
    status: "target",
    note: "Same contracts. Depth gate is SOLOMON reserve, not Pancake stock pools.",
  },
  {
    id: "robinhood",
    label: "Robinhood Chain",
    status: "target",
    note: "Uniswap v4 hook launcher. PoolManager 0x8366a39CC670B4001A1121B8F6A443A643e40951.",
  },
];
