// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Integer formulas for the gold.com.vc desk.
/// Canonical token: Solana mint GoLDEDmbque3qd1xfmnzMtg7HMju8p4UoaRX1vBsehjA.
/// 1 token = 11.4 g. These contracts are deploy targets. They are not live.
/// The running check is tests/solomon-suite.test.ts against src/lib/solomon.
library SolomonMath {
    uint256 internal constant UNIT = 1e6;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant TAX_BPS = 200;
    uint256 internal constant PARTNER_OF_TAX_BPS = 5_000;
    uint256 internal constant MG_PER_TOKEN = 11_400;
    uint256 internal constant ACC_SCALE = 1e18;
    uint256 internal constant INDEX_SCALE = 1e12;
    uint256 internal constant MCR_BPS = 11_000;
    uint256 internal constant CCR_BPS = 15_000;
    uint256 internal constant BORROW_FEE_BPS = 50;
    uint256 internal constant REDEEM_FEE_BPS = 50;
    uint256 internal constant FLASH_FEE_BPS = 3;
    uint256 internal constant CURVE_FEE_BPS = 100;
    uint256 internal constant PAY_NUM = 382;
    uint256 internal constant PAY_DEN = 1_000;
    uint256 internal constant PRICE_SCALE = 1e8;
    uint256 internal constant SECONDS_YEAR = 31_536_000;

    function gramsMilli(uint256 tokens) internal pure returns (uint256) {
        return tokens * MG_PER_TOKEN / UNIT;
    }

    /// 2% comes out of the amount. Recipient keeps 98%. Partner and buyback split the tax.
    function taxOn(uint256 amount)
        internal
        pure
        returns (uint256 tax, uint256 partnerCut, uint256 buyback, uint256 toRecipient)
    {
        tax = amount * TAX_BPS / BPS;
        partnerCut = tax * PARTNER_OF_TAX_BPS / BPS;
        buyback = tax - partnerCut;
        toRecipient = amount - tax;
    }

    function icrBps(uint256 coll, uint256 debt, uint256 priceE8) internal pure returns (uint256) {
        if (debt == 0) return coll == 0 ? 0 : 1e12;
        return collUsd(coll, priceE8) * BPS / debt;
    }

    function collUsd(uint256 coll, uint256 priceE8) internal pure returns (uint256) {
        return coll * priceE8 / PRICE_SCALE;
    }

    function borrowFee(uint256 hedgeOut) internal pure returns (uint256) {
        return hedgeOut * BORROW_FEE_BPS / BPS;
    }

    function interest(uint256 debt, uint256 rateBps, uint256 dt) internal pure returns (uint256) {
        return debt * rateBps * dt / (BPS * SECONDS_YEAR);
    }

    function redeemFee(uint256 collGross) internal pure returns (uint256) {
        return collGross * REDEEM_FEE_BPS / BPS;
    }

    function collForHedge(uint256 hedgeIn, uint256 priceE8) internal pure returns (uint256) {
        return hedgeIn * PRICE_SCALE / priceE8;
    }

    /// SOLOMON is the flex quote, so its flash fee is 0. Other assets pay 3 bps.
    function flashFee(bool solomon, uint256 amount) internal pure returns (uint256) {
        if (solomon) return 0;
        return amount * FLASH_FEE_BPS / BPS;
    }

    function halfLoan(uint256 amount) internal pure returns (uint256 locked, uint256 earning) {
        locked = amount / 2;
        earning = amount - locked;
    }

    function curveTokensOut(uint256 tokenReserve, uint256 virtualQuote, uint256 netQuote)
        internal
        pure
        returns (uint256 tokensOut, uint256 newReserve)
    {
        uint256 k = tokenReserve * virtualQuote;
        uint256 newVirtual = virtualQuote + netQuote;
        newReserve = k / newVirtual;
        tokensOut = tokenReserve - newReserve;
    }

    function curveFee(uint256 quoteIn) internal pure returns (uint256) {
        return quoteIn * CURVE_FEE_BPS / BPS;
    }

    function splash(uint256 reflectionPot) internal pure returns (uint256) {
        return reflectionPot * PAY_NUM / PAY_DEN;
    }

    /// Product-sum step. Caller settles depositors before resetting when drained.
    function offsetStep(uint256 p, uint256 s, uint256 spHedge, uint256 collShare, uint256 take)
        internal
        pure
        returns (uint256 nextS, uint256 nextP, uint256 nextHedge)
    {
        nextS = s + collShare * p / spHedge;
        nextP = p * (spHedge - take) / spHedge;
        nextHedge = spHedge - take;
    }

    function belowMinP(uint256 p) internal pure returns (bool) {
        return p < INDEX_SCALE / 1_000_000;
    }
}
