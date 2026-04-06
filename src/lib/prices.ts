// Yahoo Finance unofficial API for Indian stocks.
// NSE symbols: append ".NS" (RELIANCE.NS). BSE: append ".BO".
// Cached in PriceSnapshot table for 10 minutes.

import { prisma } from "@/lib/prisma";
import type { Exchange } from "@prisma/client";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

function yahooSymbol(symbol: string, exchange: Exchange): string {
  const suffix = exchange === "NSE" ? ".NS" : ".BO";
  return `${symbol}${suffix}`;
}

async function fetchFromYahoo(symbol: string, exchange: Exchange): Promise<number | null> {
  const ys = yahooSymbol(symbol, exchange);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ys}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (stock-tracker)" },
      // Next.js: avoid caching at the fetch layer — we manage our own cache
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

/**
 * Get current price, using cache when fresh.
 * Returns null if price cannot be fetched and no cache exists.
 */
export async function getPrice(
  symbol: string,
  exchange: Exchange
): Promise<number | null> {
  const cached = await prisma.priceSnapshot.findUnique({
    where: { symbol_exchange: { symbol, exchange } },
  });

  const now = Date.now();
  if (cached && now - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.price;
  }

  const fresh = await fetchFromYahoo(symbol, exchange);
  if (fresh != null) {
    await prisma.priceSnapshot.upsert({
      where: { symbol_exchange: { symbol, exchange } },
      create: { symbol, exchange, price: fresh },
      update: { price: fresh, fetchedAt: new Date() },
    });
    return fresh;
  }

  // Yahoo failed — fall back to stale cache if we have one
  return cached?.price ?? null;
}

/**
 * Batch fetch prices for multiple symbols. Returns Map<symbol, price>.
 */
export async function getPrices(
  items: { symbol: string; exchange: Exchange }[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  await Promise.all(
    items.map(async (it) => {
      const p = await getPrice(it.symbol, it.exchange);
      if (p != null) result.set(it.symbol, p);
    })
  );
  return result;
}
