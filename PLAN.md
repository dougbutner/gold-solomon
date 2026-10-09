# SOLOMON on gold.com.vc

Directive: build this desk for [gold.com.vc](https://gold.com.vc/index.html). The page already says gold that adds volatility, 11.4 grams per token, a 2% transfer tax, and half of that tax to partners. This repo is that rule set, carried onto every chain where SOLOMON can be quoted.

## What changed

The launcher no longer quotes tokenized stocks. SOLOMON is the quote and the collateral. The Solana mint `GoLDEDmbque3qd1xfmnzMtg7HMju8p4UoaRX1vBsehjA` is the canonical token. One token is 11.4 grams of gold. Ethereum, Base, BNB Chain, and Robinhood Chain are deploy targets for the same rules against bridged SOLOMON. They are not live.

## What is reused

| Source | Rule kept |
| --- | --- |
| gold.com.vc | 2% transfer tax. Half to partners by stake. Half to buybacks. If nobody is staked, the partner half joins buybacks. |
| Hedgewaters `flexloans` | CDP, rate buckets 50/100/200/400/600/1000 bps, 110% MCR, 150% CCR, 0.50% borrow fee, stability-pool product-sum, liquidation, redeem lowest rate first. |
| Hedgewaters `easyloan` | Half the deposit locks. Half is partner weight. |
| Hedgewaters `flashloan` | Same-transaction flash. 3 bps. Fee is 0 when the asset is SOLOMON. An unpaid flash restores the reserve. |
| flex.forex | Transfer tax cannot rise. Reflection cannot fall. Rain pays 382/1000 and the unpaid remainder returns to the pot. Curve, locker, hook, and factory are exempt. |

SOLOMON's 2% is its own fee. It is not the Flex tax on a launched token. The curve's 1% is a quote fee. Those three do not stack on the same leg.

## Flow

1. A wallet holds SOLOMON. A plain transfer pays 2% out of the amount. The recipient gets 98%.
2. Partner stake earns the partner half through an accumulator. Claims cannot overdraw the pot.
3. A half-lock parks half the deposit and stakes the other half.
4. A trove locks SOLOMON and mints HEDGE. ICR is collateral USD over debt. Gold price is USD per token times 1e8.
5. Interest and the borrow fee accrue to the stability pool index. They are not extra principal. A deposit already burned its HEDGE, so a liquidation must not burn that principal again.
6. Under 110% the trove can be liquidated. The pool seizes gold in proportion to the debt it offsets. A full drain settles depositor gold before the index resets. Gold that backed debt the pool did not offset stays with the system. It is not returned to the borrower. Fee HEDGE that matches that residual debt is burned.
7. Redemption walks the lowest rate first. The redeemer pays 0.50% of the gold.
8. A flash of SOLOMON costs nothing. A flash of any other asset costs 3 bps. If the callback does not return amount plus fee, the reserve is unchanged.
9. A launch curve is quoted only in SOLOMON. At 4 SOLOMON of real quote it graduates. Grams behind the book are `quote * 11400 / 1e6` milligrams.
10. After graduation, holder transfers of the launch token pay the Flex tax on top of the amount. `makeitrain` splashes 38.2% and leaves the rest.

## Where the code runs

The executable spec is `src/lib/solomon/`. The suite is `tests/solomon-suite.test.ts`. The desk pages call those functions. Do not keep a second copy of the formulas in the UI.

`contracts/SolomonMath.sol` and `contracts/SolomonDesk.sol` are the chain targets. They use the same integer division. They are not deployed, and no address in this repo is a live SOLOMON contract except the Solana mint above.

```bash
node --experimental-strip-types --test tests/solomon-suite.test.ts
```

Checked path, among others: 2% of 10,000 is 200, split 75/25 on a 3:1 stake, buyback 100. Ten SOLOMON at $1,600 against 8,040 debt is 19,900 bps. At $800 it is 9,950 bps. The pool seizes 9.950248 SOLOMON. Redeeming 1,600 HEDGE at $1,600 returns 0.995 SOLOMON after the 0.50% fee. Rain leaves the pot equal to the pot minus what was actually paid.
