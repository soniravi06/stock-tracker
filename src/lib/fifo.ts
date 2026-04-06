// FIFO engine: matches sells against oldest buy lots first.
// Computes realized gain (STCG vs LTCG per Indian equity rules: 12-month holding)
// and current holdings with weighted avg cost basis for unrealized gain calc.
//
// Commission treatment:
//   - Buy commission is ADDED to cost basis (split proportionally across lot quantity)
//   - Sell commission is SUBTRACTED from gross proceeds before gain calc

import type { Transaction } from "@prisma/client";

const LTCG_DAYS = 365; // India: >12 months = LTCG for listed equity

export type Lot = {
  txId: string;
  symbol: string;
  acquiredAt: Date;
  remainingQty: number;
  costPerShareWithCommission: number; // price + allocated commission per share
};

export type RealizedGainRow = {
  sellTxId: string;
  symbol: string;
  sellDate: Date;
  quantity: number;
  saleProceedsNet: number; // after sell commission
  costBasis: number;       // original buy cost including buy commission
  gain: number;
  classification: "STCG" | "LTCG";
  holdingDays: number;
};

export type Holding = {
  symbol: string;
  quantity: number;
  avgCostPerShare: number; // weighted avg across remaining lots, commission-inclusive
  totalCostBasis: number;
};

export type GainSummary = {
  holdings: Holding[];
  realized: RealizedGainRow[];
  totals: {
    realizedSTCG: number;
    realizedLTCG: number;
    realizedTotal: number;
    unrealizedTotal: number; // requires current prices passed separately
  };
};

/**
 * Run FIFO matching over a chronological list of transactions for a single client.
 * Returns open lots (current holdings) and realized gain events.
 */
export function computeFifo(transactions: Transaction[]): {
  openLots: Lot[];
  realized: RealizedGainRow[];
} {
  // Only consider non-deleted, non-reversed
  const txs = transactions
    .filter((t) => !t.deletedAt && !t.reversedByTransactionId)
    .sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());

  // Lots grouped per symbol, FIFO queue
  const lotsBySymbol = new Map<string, Lot[]>();
  const realized: RealizedGainRow[] = [];

  for (const tx of txs) {
    const qty = tx.quantity;
    const price = tx.pricePerShare;
    const commission = tx.commissionAmount;

    if (tx.type === "buy") {
      // Allocate commission across each share
      const costPerShare = price + commission / qty;
      const lot: Lot = {
        txId: tx.id,
        symbol: tx.symbol,
        acquiredAt: tx.tradeDate,
        remainingQty: qty,
        costPerShareWithCommission: costPerShare,
      };
      const arr = lotsBySymbol.get(tx.symbol) ?? [];
      arr.push(lot);
      lotsBySymbol.set(tx.symbol, arr);
    } else {
      // SELL — match against oldest lots
      let qtyToSell = qty;
      // Sell commission is netted out of proceeds proportionally to shares sold in each match
      const sellCommissionPerShare = commission / qty;
      const netPricePerShare = price - sellCommissionPerShare;

      const lots = lotsBySymbol.get(tx.symbol) ?? [];
      while (qtyToSell > 0 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(lot.remainingQty, qtyToSell);

        const saleProceedsNet = take * netPricePerShare;
        const costBasis = take * lot.costPerShareWithCommission;
        const gain = saleProceedsNet - costBasis;

        const holdingDays = Math.floor(
          (tx.tradeDate.getTime() - lot.acquiredAt.getTime()) / 86400000
        );
        const classification = holdingDays > LTCG_DAYS ? "LTCG" : "STCG";

        realized.push({
          sellTxId: tx.id,
          symbol: tx.symbol,
          sellDate: tx.tradeDate,
          quantity: take,
          saleProceedsNet,
          costBasis,
          gain,
          classification,
          holdingDays,
        });

        lot.remainingQty -= take;
        qtyToSell -= take;
        if (lot.remainingQty <= 0.0000001) {
          lots.shift();
        }
      }

      if (qtyToSell > 0) {
        // Short sale / data error — in a real app we'd flag this.
        // For now, ignore the overshoot silently.
      }
      lotsBySymbol.set(tx.symbol, lots);
    }
  }

  const openLots: Lot[] = [];
  for (const lots of lotsBySymbol.values()) {
    for (const lot of lots) {
      if (lot.remainingQty > 0.0000001) openLots.push(lot);
    }
  }

  return { openLots, realized };
}

/**
 * Aggregate open lots into holdings per symbol with weighted average cost.
 */
export function lotsToHoldings(openLots: Lot[]): Holding[] {
  const bySymbol = new Map<string, Holding>();
  for (const lot of openLots) {
    const existing = bySymbol.get(lot.symbol);
    const lotCost = lot.remainingQty * lot.costPerShareWithCommission;
    if (existing) {
      existing.quantity += lot.remainingQty;
      existing.totalCostBasis += lotCost;
      existing.avgCostPerShare =
        existing.totalCostBasis / existing.quantity;
    } else {
      bySymbol.set(lot.symbol, {
        symbol: lot.symbol,
        quantity: lot.remainingQty,
        avgCostPerShare: lot.costPerShareWithCommission,
        totalCostBasis: lotCost,
      });
    }
  }
  return Array.from(bySymbol.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
}

/**
 * Build the full gain summary given current prices.
 * currentPrices: map of symbol -> live price
 */
export function buildGainSummary(
  transactions: Transaction[],
  currentPrices: Map<string, number>
): GainSummary {
  const { openLots, realized } = computeFifo(transactions);
  const holdings = lotsToHoldings(openLots);

  let realizedSTCG = 0;
  let realizedLTCG = 0;
  for (const r of realized) {
    if (r.classification === "STCG") realizedSTCG += r.gain;
    else realizedLTCG += r.gain;
  }

  let unrealizedTotal = 0;
  for (const h of holdings) {
    const currentPrice = currentPrices.get(h.symbol);
    if (currentPrice != null) {
      unrealizedTotal += (currentPrice - h.avgCostPerShare) * h.quantity;
    }
  }

  return {
    holdings,
    realized,
    totals: {
      realizedSTCG,
      realizedLTCG,
      realizedTotal: realizedSTCG + realizedLTCG,
      unrealizedTotal,
    },
  };
}
