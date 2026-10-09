// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SolomonMath} from "./SolomonMath.sol";

/// Stateful desk for chains that will hold bridged SOLOMON.
/// Solana already has the mint. This contract is the target, not a live deployment.
/// Ethereum, Base, BNB Chain, and Robinhood Chain (PoolManager
/// 0x8366a39CC670B4001A1121B8F6A443A643e40951) get this same rule set.
contract SolomonDesk {
    uint256 public constant MCR_BPS = SolomonMath.MCR_BPS;
    uint256 public constant CCR_BPS = SolomonMath.CCR_BPS;

    mapping(address => uint256) public solomon;
    mapping(address => uint256) public stakeOf;
    mapping(address => uint256) public rewardDebt;
    uint256 public totalStake;
    uint256 public accPerStake;
    uint256 public partnerPot;
    uint256 public buybackPot;

    struct Trove {
        uint256 coll;
        uint256 debt;
        uint256 rateBps;
        uint64 lastAccrue;
        bool open;
    }

    mapping(address => Trove) public troves;
    uint256 public activeColl;
    uint256 public activeDebt;
    uint256 public spHedge;
    uint256 public spP = SolomonMath.INDEX_SCALE;
    uint256 public spS;
    uint256 public spG;
    uint256 public badDebt;
    mapping(address => uint256) public hedge;
    uint256 public hedgeSupply;
    uint256 public priceE8;
    uint64 public nowTs;

    uint256 public reserveSolomon;
    uint256 public reserveOther;
    uint256 public flashFeesOther;
    mapping(address => uint256) public locked;

    event Tax(address indexed from, address indexed to, uint256 tax, uint256 partnerCut, uint256 buyback);
    event HalfLocked(address indexed who, uint256 lockedAmount, uint256 earning);
    event Borrowed(address indexed who, uint256 hedgeOut, uint256 fee, uint256 debt);
    event Liquidated(address indexed who, uint256 offset, uint256 collToSp, uint256 residualColl);

    error Amount();
    error Short();
    error Healthy();
    error Rate();
    error FlashUnpaid();

    constructor(uint256 seedSolomon, uint256 seedPriceE8) {
        solomon[msg.sender] = seedSolomon;
        reserveSolomon = seedSolomon;
        priceE8 = seedPriceE8;
    }

    function transferSolomon(address to, uint256 amount, bool exempt) external {
        if (to == msg.sender || amount == 0 || solomon[msg.sender] < amount) revert Amount();
        solomon[msg.sender] -= amount;
        if (exempt) {
            solomon[to] += amount;
            return;
        }
        (uint256 tax, uint256 partnerCut, uint256 buyback, uint256 toRecipient) = SolomonMath.taxOn(amount);
        solomon[to] += toRecipient;
        buybackPot += buyback;
        if (partnerCut > 0) {
            if (totalStake == 0) buybackPot += partnerCut;
            else {
                accPerStake += partnerCut * SolomonMath.ACC_SCALE / totalStake;
                partnerPot += partnerCut;
            }
        }
        emit Tax(msg.sender, to, tax, partnerCut, buyback);
    }

    function pending(address who) public view returns (uint256) {
        uint256 st = stakeOf[who];
        if (st == 0) return 0;
        uint256 accrued = st * accPerStake / SolomonMath.ACC_SCALE;
        return accrued > rewardDebt[who] ? accrued - rewardDebt[who] : 0;
    }

    function stake(uint256 amount) external {
        if (amount == 0 || solomon[msg.sender] < amount) revert Amount();
        _harvest(msg.sender);
        solomon[msg.sender] -= amount;
        stakeOf[msg.sender] += amount;
        totalStake += amount;
        rewardDebt[msg.sender] = stakeOf[msg.sender] * accPerStake / SolomonMath.ACC_SCALE;
    }

    function claim() external returns (uint256 owed) {
        owed = pending(msg.sender);
        if (owed > partnerPot) revert Short();
        partnerPot -= owed;
        solomon[msg.sender] += owed;
        rewardDebt[msg.sender] = stakeOf[msg.sender] * accPerStake / SolomonMath.ACC_SCALE;
    }

    /// Easyloan: half stays locked, half is partner stake.
    function halfLock(uint256 amount) external {
        (uint256 lockedAmount, uint256 earning) = SolomonMath.halfLoan(amount);
        if (amount == 0 || solomon[msg.sender] < amount) revert Amount();
        _harvest(msg.sender);
        solomon[msg.sender] -= amount;
        locked[msg.sender] += lockedAmount;
        if (earning > 0) {
            stakeOf[msg.sender] += earning;
            totalStake += earning;
        }
        rewardDebt[msg.sender] = stakeOf[msg.sender] * accPerStake / SolomonMath.ACC_SCALE;
        emit HalfLocked(msg.sender, lockedAmount, earning);
    }

    function flashSolomon(uint256 amount, uint256 repayAmount) external {
        if (amount == 0 || amount > reserveSolomon) revert Amount();
        uint256 due = amount + SolomonMath.flashFee(true, amount);
        if (repayAmount < due) revert FlashUnpaid();
        reserveSolomon = reserveSolomon - amount + due;
    }

    function flashOther(uint256 amount, uint256 repayAmount) external {
        if (amount == 0 || amount > reserveOther) revert Amount();
        uint256 fee = SolomonMath.flashFee(false, amount);
        uint256 due = amount + fee;
        if (repayAmount < due) revert FlashUnpaid();
        reserveOther = reserveOther - amount + due;
        flashFeesOther += fee;
    }

    function openTrove(uint256 coll, uint256 rateBps) external {
        if (!_rate(rateBps) || coll == 0 || solomon[msg.sender] < coll || troves[msg.sender].open) revert Rate();
        solomon[msg.sender] -= coll;
        troves[msg.sender] = Trove({coll: coll, debt: 0, rateBps: rateBps, lastAccrue: nowTs, open: true});
        activeColl += coll;
    }

    function borrow(uint256 hedgeOut) external {
        Trove storage t = troves[msg.sender];
        if (!t.open || hedgeOut == 0) revert Amount();
        _accrue(t);
        uint256 fee = SolomonMath.borrowFee(hedgeOut);
        t.debt += hedgeOut + fee;
        uint256 floor = _tcr() < CCR_BPS ? CCR_BPS : MCR_BPS;
        if (SolomonMath.icrBps(t.coll, t.debt, priceE8) < floor) revert Healthy();
        activeDebt += hedgeOut + fee;
        hedge[msg.sender] += hedgeOut;
        hedgeSupply += hedgeOut + fee;
        emit Borrowed(msg.sender, hedgeOut, fee, t.debt);
    }

    /// Offsets against the stability pool. Residual gold is not returned to the borrower.
    /// Residual debt burns HEDGE already minted as the fee when the pool holds it.
    function liquidate(address who) external returns (uint256 offset, uint256 collToSp) {
        Trove storage t = troves[who];
        if (!t.open) revert Amount();
        _accrue(t);
        if (SolomonMath.icrBps(t.coll, t.debt, priceE8) >= MCR_BPS) revert Healthy();
        uint256 debt = t.debt;
        uint256 coll = t.coll;
        offset = debt > spHedge ? spHedge : debt;
        collToSp = debt == 0 ? 0 : coll * offset / debt;
        if (offset > 0) {
            (spS, spP, spHedge) = SolomonMath.offsetStep(spP, spS, spHedge, collToSp, offset);
            if (spHedge == 0 || SolomonMath.belowMinP(spP)) {
                spP = SolomonMath.INDEX_SCALE;
                spS = 0;
                spG = 0;
                spHedge = 0;
            }
        }
        uint256 remainderDebt = debt - offset;
        uint256 remainderColl = coll - collToSp;
        if (remainderDebt > 0) {
            uint256 burnAmt = remainderDebt > hedgeSupply ? hedgeSupply : remainderDebt;
            hedgeSupply -= burnAmt;
            badDebt += remainderDebt - burnAmt;
        }
        activeColl -= coll;
        activeDebt -= debt;
        t.coll = 0;
        t.debt = 0;
        t.open = false;
        emit Liquidated(who, offset, collToSp, remainderColl);
    }

    function redeem(uint256 hedgeIn) external returns (uint256 collOut, uint256 fee) {
        if (hedgeIn == 0 || hedge[msg.sender] < hedgeIn || activeDebt < hedgeIn) revert Amount();
        uint256 gross = SolomonMath.collForHedge(hedgeIn, priceE8);
        fee = SolomonMath.redeemFee(gross);
        collOut = gross - fee;
        hedge[msg.sender] -= hedgeIn;
        hedgeSupply -= hedgeIn;
        activeDebt -= hedgeIn;
        solomon[msg.sender] += collOut;
    }

    function curveBuy(uint256 tokenReserve, uint256 virtualQuote, uint256 quoteIn)
        external
        pure
        returns (uint256 tokensOut, uint256 fee)
    {
        fee = SolomonMath.curveFee(quoteIn);
        (tokensOut,) = SolomonMath.curveTokensOut(tokenReserve, virtualQuote, quoteIn - fee);
    }

    function setFees(uint256 prevTotal, uint256 prevReflection, uint256 reflection, uint256 burn, uint256 project)
        external
        pure
        returns (bool ok)
    {
        uint256 next = reflection + burn + project;
        if (next > SolomonMath.BPS) return false;
        if (prevTotal != 0 && (next > prevTotal || reflection < prevReflection)) return false;
        return true;
    }

    function rainSplash(uint256 pot) external pure returns (uint256) {
        return SolomonMath.splash(pot);
    }

    function _harvest(address who) internal {
        uint256 owed = pending(who);
        if (owed == 0) return;
        if (owed > partnerPot) revert Short();
        partnerPot -= owed;
        solomon[who] += owed;
    }

    function _accrue(Trove storage t) internal {
        uint256 dt = nowTs - t.lastAccrue;
        t.lastAccrue = nowTs;
        if (t.debt == 0 || dt == 0) return;
        uint256 due = SolomonMath.interest(t.debt, t.rateBps, dt);
        t.debt += due;
        activeDebt += due;
        hedgeSupply += due;
        if (spHedge > 0) spG += due * spP / spHedge;
    }

    function _tcr() internal view returns (uint256) {
        return SolomonMath.icrBps(activeColl, activeDebt, priceE8);
    }

    function _rate(uint256 rateBps) internal pure returns (bool) {
        return rateBps == 50 || rateBps == 100 || rateBps == 200 || rateBps == 400 || rateBps == 600
            || rateBps == 1000;
    }
}
