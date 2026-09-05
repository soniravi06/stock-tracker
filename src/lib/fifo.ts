// Position model engine.
//
// Current Holdings = aggregation of Transaction rows where remainingQty > 0.
// Each buy lot carries its own remainingQty that decrements when sold.
//
// When selling: FIFO-match against oldest open lots. Returns the match plan
// which the server action then applies in a transaction (decrementing lots,
// creating a CompletedTrade).

import type { Transaction } from "@prisma/client";

// The subset of Transaction fields that buildHoldings actually reads.
// Accepting a structural subset lets callers pass either full rows or
// narrowly-`select`ed rows (e.g. the dashboard's optimized query).
export type HoldingLot = Pick<
  Transaction,
  | "id"
  | "symbol"
  | "exchange"
  | "quantity"
  | "remainingQty"
  | "pricePerShare"
  | "tradeDate"
  | "deletedAt"
>;

export type LotMatch = {
  buyTransactionId: string;
  buyDate: string; // ISO
  buyPrice: number;
  qty: number;
};

export type MatchPlan = {
  matches: LotMatch[];
  totalBuyCost: number;
  avgBuyPrice: number;
  error?: string;
};

/**
 * FIFO-match a sell quantity against the client's open buy lots for a symbol.
 * Returns the plan without mutating anything.
 */
export function planFifoSell(
  openLots: Transaction[],
  symbol: string,
  sellQty: number
): MatchPlan {
  const relevant = openLots
    .filter((l) => l.symbol === symbol && !l.deletedAt && l.remainingQty > 0)
    .sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());

  const matches: LotMatch[] = [];
  let remainingToSell = sellQty;
  let totalBuyCost = 0;

  for (const lot of relevant) {
    if (remainingToSell <= 0.0000001) break;
    const take = Math.min(lot.remainingQty, remainingToSell);
    matches.push({
      buyTransactionId: lot.id,
      buyDate: lot.tradeDate.toISOString(),
      buyPrice: lot.pricePerShare,
      qty: take,
    });
    totalBuyCost += take * lot.pricePerShare;
    remainingToSell -= take;
  }

  if (remainingToSell > 0.0000001) {
    return {
      matches: [],
      totalBuyCost: 0,
      avgBuyPrice: 0,
      error: `Not enough shares. Trying to sell ${sellQty} but only ${
        sellQty - remainingToSell
      } available.`,
    };
  }

  return {
    matches,
    totalBuyCost,
    avgBuyPrice: totalBuyCost / sellQty,
  };
}

/**
 * Compute commission in INR from type + value + gross P&L.
 * For percentage: commission = grossPnL * value / 100 (signed — negative on losses).
 * For flat: fixed INR amount regardless of P&L direction.
 */
export function computeCommission(
  type: "percentage" | "flat",
  value: number,
  grossPnL: number
): number {
  if (type === "percentage") return (grossPnL * value) / 100;
  return value;
}

export type Holding = {
  symbol: string;
  exchange: "NSE" | "BSE";
  totalQty: number;
  avgCostPerShare: number;
  totalCostBasis: number;
  lots: {
    transactionId: string;
    buyDate: Date;
    originalQty: number;
    remainingQty: number;
    pricePerShare: number;
  }[];
};

/**
 * Aggregate open lots into holdings per symbol.
 */
export function buildHoldings(lots: HoldingLot[]): Holding[] {
  const bySymbol = new Map<string, Holding>();

  for (const lot of lots) {
    if (lot.deletedAt || lot.remainingQty <= 0.0000001) continue;

    const existing = bySymbol.get(lot.symbol);
    const lotCost = lot.remainingQty * lot.pricePerShare;

    if (existing) {
      existing.totalQty += lot.remainingQty;
      existing.totalCostBasis += lotCost;
      existing.avgCostPerShare = existing.totalCostBasis / existing.totalQty;
      existing.lots.push({
        transactionId: lot.id,
        buyDate: lot.tradeDate,
        originalQty: lot.quantity,
        remainingQty: lot.remainingQty,
        pricePerShare: lot.pricePerShare,
      });
    } else {
      bySymbol.set(lot.symbol, {
        symbol: lot.symbol,
        exchange: lot.exchange as "NSE" | "BSE",
        totalQty: lot.remainingQty,
        totalCostBasis: lotCost,
        avgCostPerShare: lot.pricePerShare,
        lots: [
          {
            transactionId: lot.id,
            buyDate: lot.tradeDate,
            originalQty: lot.quantity,
            remainingQty: lot.remainingQty,
            pricePerShare: lot.pricePerShare,
          },
        ],
      });
    }
  }

  // Sort each holding's lots by date for display
  for (const h of bySymbol.values()) {
    h.lots.sort((a, b) => a.buyDate.getTime() - b.buyDate.getTime());
  }

  return Array.from(bySymbol.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
}
