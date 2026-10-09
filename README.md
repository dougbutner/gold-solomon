# SOLOMON

Gold desk for [gold.com.vc](https://gold.com.vc/index.html).

SOLOMON is the quote and the collateral. The canonical mint is Solana `GoLDEDmbque3qd1xfmnzMtg7HMju8p4UoaRX1vBsehjA`. One token is 11.4 grams. A transfer pays 2% from the amount: half to partners by stake, half to buybacks.

The same rules are what we take to Ethereum, Base, BNB Chain, and Robinhood Chain. Those chains are deploy targets. This repository does not claim a live contract there.

Read [PLAN.md](PLAN.md) before changing a formula.

| Piece | Role |
| --- | --- |
| `src/lib/solomon/` | Executable spec. The UI calls these functions. |
| `tests/solomon-suite.test.ts` | Integer checks. Tabular expected versus actual. |
| `contracts/SolomonMath.sol` | Same divisions, for the other chains. |
| `contracts/SolomonDesk.sol` | Stateful target: tax, half-lock, flash, trove, curve fee, rain splash. |

```bash
node --experimental-strip-types --test tests/solomon-suite.test.ts
```

Hedgewaters supplies the borrow, half-lock, and flash. flex.forex supplies the monotonic transfer tax and the 382/1000 rain. Protocol liquidity stays locked. Curve, locker, and hook transfers of SOLOMON are exempt.
