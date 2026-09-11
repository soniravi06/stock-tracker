import { prisma } from "@/lib/prisma";

type AlertWithLot = {
  id: string;
  transactionId: string;
  clientId: string;
  mode: "price" | "percent";
  direction: "above" | "below";
  targetPrice: number | null;
  targetPercent: number | null;
  transaction: { symbol: string; pricePerShare: number };
};

function thresholdFor(a: AlertWithLot): number | null {
  if (a.mode === "price") return a.targetPrice;
  if (a.targetPercent == null) return null;
  return a.transaction.pricePerShare * (1 + a.targetPercent / 100);
}

function isTriggered(a: AlertWithLot, currentPrice: number): boolean {
  const t = thresholdFor(a);
  if (t == null) return false;
  return a.direction === "above" ? currentPrice >= t : currentPrice <= t;
}

function buildMessage(a: AlertWithLot, currentPrice: number): string {
  const buy = a.transaction.pricePerShare;
  const pct = ((currentPrice - buy) / buy) * 100;
  const rule =
    a.mode === "price"
      ? `${a.direction === "above" ? ">=" : "<="} Rs.${a.targetPrice?.toFixed(2)}`
      : `${a.direction === "above" ? "+" : ""}${a.targetPercent}% from buy Rs.${buy.toFixed(2)}`;
  return `${a.transaction.symbol} hit Rs.${currentPrice.toFixed(2)} (rule: ${rule}, ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs buy)`;
}

/**
 * Evaluate all active alerts for a client against current prices.
 * Triggered alerts are marked + an AlertEvent is recorded.
 * Fail-safe: never throws.
 */
export async function evaluateAlertsForClient(
  clientId: string,
  prices: Map<string, number>
): Promise<void> {
  try {
    const active = await prisma.priceAlert.findMany({
      where: { clientId, status: "active", deletedAt: null },
      include: { transaction: { select: { symbol: true, pricePerShare: true } } },
    });
    if (active.length === 0) return;

    const now = new Date();
    for (const a of active) {
      const px = prices.get(a.transaction.symbol);
      if (px == null) continue;
      if (!isTriggered(a, px)) continue;
      await prisma.$transaction([
        prisma.priceAlert.update({
          where: { id: a.id },
          data: { status: "triggered", triggeredAt: now, triggeredPrice: px },
        }),
        prisma.alertEvent.create({
          data: {
            alertId: a.id,
            transactionId: a.transactionId,
            clientId: a.clientId,
            symbol: a.transaction.symbol,
            priceAtTrigger: px,
            message: buildMessage(a, px),
            triggeredAt: now,
          },
        }),
      ]);
    }
  } catch (e) {
    console.error("evaluateAlertsForClient failed:", e);
  }
}
