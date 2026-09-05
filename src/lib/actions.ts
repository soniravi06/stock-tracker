"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, getAuthorizedClient } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { planFifoSell, computeCommission } from "@/lib/fifo";
import { revalidatePath } from "next/cache";

// ============================================================
// SELL from holding — creates a CompletedTrade and decrements lots
// ============================================================
export async function sellFromHoldingAction(formData: FormData) {
  const session = await requireSession();
  if (session.user.role === "client") throw new Error("read-only");

  const clientId = String(formData.get("clientId"));
  const client = await getAuthorizedClient(clientId);
  if (!client) throw new Error("client not found");

  const symbol = String(formData.get("symbol")).toUpperCase();
  const sellQty = parseFloat(String(formData.get("sellQty")));
  const sellPrice = parseFloat(String(formData.get("sellPrice")));
  const sellDateStr = String(formData.get("sellDate"));
  const commissionType = String(formData.get("commissionType") || "percentage") as "percentage" | "flat";
  const commissionValue = parseFloat(String(formData.get("commissionValue") || "0"));
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!symbol || sellQty <= 0 || sellPrice <= 0) {
    throw new Error("invalid input");
  }

  // Load open lots for this symbol
  const openLots = await prisma.transaction.findMany({
    where: { clientId, symbol, deletedAt: null, remainingQty: { gt: 0 } },
    orderBy: { tradeDate: "asc" },
  });

  const plan = planFifoSell(openLots, symbol, sellQty);
  if (plan.error) throw new Error(plan.error);

  const totalSellProceeds = sellQty * sellPrice;
  const grossPnL = totalSellProceeds - plan.totalBuyCost;
  const commissionAmount = computeCommission(commissionType, commissionValue, grossPnL);
  const netPnL = grossPnL - commissionAmount;

  // Apply as a transaction: decrement lots + create completed trade
  const trade = await prisma.$transaction(async (tx) => {
    for (const m of plan.matches) {
      await tx.transaction.update({
        where: { id: m.buyTransactionId },
        data: { remainingQty: { decrement: m.qty } },
      });
    }
    return tx.completedTrade.create({
      data: {
        clientId,
        symbol,
        exchange: openLots[0]?.exchange ?? "NSE",
        sellDate: new Date(sellDateStr),
        sellQty,
        sellPricePerShare: sellPrice,
        avgBuyPrice: plan.avgBuyPrice,
        totalBuyCost: plan.totalBuyCost,
        totalSellProceeds,
        grossPnL,
        commissionType,
        commissionValue,
        commissionAmount,
        netPnL,
        matchedLotsJson: JSON.stringify(plan.matches),
        notes,
        createdByUserId: session.user.id,
      },
    });
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "create",
    entityType: "CompletedTrade",
    entityId: trade.id,
    after: trade,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/my");
  revalidatePath("/audit");
}

// ============================================================
// EDIT completed trade — no FIFO re-match, just recompute totals
// ============================================================
export async function editCompletedTradeAction(formData: FormData) {
  const session = await requireSession();
  if (session.user.role === "client") throw new Error("read-only");

  const tradeId = String(formData.get("tradeId"));
  const sellPrice = parseFloat(String(formData.get("sellPrice")));
  const sellDateStr = String(formData.get("sellDate"));
  const commissionType = String(formData.get("commissionType") || "percentage") as "percentage" | "flat";
  const commissionValue = parseFloat(String(formData.get("commissionValue") || "0"));
  const notes = String(formData.get("notes") || "").trim() || null;

  const existing = await prisma.completedTrade.findUnique({ where: { id: tradeId } });
  if (!existing) throw new Error("trade not found");

  // Role check via client scope
  const client = await getAuthorizedClient(existing.clientId);
  if (!client) throw new Error("unauthorized");

  // Recompute
  const totalSellProceeds = existing.sellQty * sellPrice;
  const grossPnL = totalSellProceeds - existing.totalBuyCost;
  const commissionAmount = computeCommission(commissionType, commissionValue, grossPnL);
  const netPnL = grossPnL - commissionAmount;

  const updated = await prisma.completedTrade.update({
    where: { id: tradeId },
    data: {
      sellPricePerShare: sellPrice,
      sellDate: new Date(sellDateStr),
      commissionType,
      commissionValue,
      commissionAmount,
      totalSellProceeds,
      grossPnL,
      netPnL,
      notes,
    },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "update",
    entityType: "CompletedTrade",
    entityId: tradeId,
    before: existing,
    after: updated,
  });

  revalidatePath(`/clients/${existing.clientId}`);
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/my");
  revalidatePath("/audit");
}

// ============================================================
// DELETE (soft) a completed trade — restores the matched lots
// ============================================================
export async function deleteCompletedTradeAction(formData: FormData) {
  const session = await requireSession();
  if (session.user.role === "client") throw new Error("read-only");

  const tradeId = String(formData.get("tradeId"));
  const trade = await prisma.completedTrade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error("not found");

  const client = await getAuthorizedClient(trade.clientId);
  if (!client) throw new Error("unauthorized");

  const matches = JSON.parse(trade.matchedLotsJson) as {
    buyTransactionId: string;
    qty: number;
  }[];

  await prisma.$transaction(async (tx) => {
    // Restore lot quantities
    for (const m of matches) {
      await tx.transaction.update({
        where: { id: m.buyTransactionId },
        data: { remainingQty: { increment: m.qty } },
      });
    }
    // Soft delete the completed trade
    await tx.completedTrade.update({
      where: { id: tradeId },
      data: { deletedAt: new Date() },
    });
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "soft_delete",
    entityType: "CompletedTrade",
    entityId: tradeId,
    before: trade,
  });

  revalidatePath(`/clients/${trade.clientId}`);
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/my");
  revalidatePath("/audit");
}

// ============================================================
// EDIT a buy lot — allowed only if nothing sold from it
// ============================================================
export async function editBuyLotAction(formData: FormData) {
  const session = await requireSession();
  if (session.user.role === "client") throw new Error("read-only");

  const lotId = String(formData.get("lotId"));
  const existing = await prisma.transaction.findUnique({ where: { id: lotId } });
  if (!existing) throw new Error("lot not found");

  const client = await getAuthorizedClient(existing.clientId);
  if (!client) throw new Error("unauthorized");

  // Block edit if any shares have been sold from this lot
  if (existing.remainingQty < existing.quantity) {
    throw new Error(
      `Cannot edit: ${existing.quantity - existing.remainingQty} shares have been sold from this lot. Edit or delete the corresponding completed trades first.`
    );
  }

  const quantity = parseFloat(String(formData.get("quantity")));
  const pricePerShare = parseFloat(String(formData.get("pricePerShare")));
  const tradeDate = new Date(String(formData.get("tradeDate")));
  const notes = String(formData.get("notes") || "").trim() || null;

  const updated = await prisma.transaction.update({
    where: { id: lotId },
    data: {
      quantity,
      remainingQty: quantity, // same since nothing sold yet
      pricePerShare,
      tradeDate,
      notes,
    },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "update",
    entityType: "Transaction",
    entityId: lotId,
    before: existing,
    after: updated,
  });

  revalidatePath(`/clients/${existing.clientId}`);
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/audit");
}

// ============================================================
// DELETE (soft) a buy lot
// ============================================================
export async function deleteBuyLotAction(formData: FormData) {
  const session = await requireSession();
  if (session.user.role === "client") throw new Error("read-only");

  const lotId = String(formData.get("lotId"));
  const existing = await prisma.transaction.findUnique({ where: { id: lotId } });
  if (!existing) throw new Error("not found");

  const client = await getAuthorizedClient(existing.clientId);
  if (!client) throw new Error("unauthorized");

  if (existing.remainingQty < existing.quantity) {
    throw new Error(
      "Cannot delete: shares have been sold from this lot. Delete the completed trades first."
    );
  }

  const updated = await prisma.transaction.update({
    where: { id: lotId },
    data: { deletedAt: new Date() },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "soft_delete",
    entityType: "Transaction",
    entityId: lotId,
    before: existing,
    after: updated,
  });

  revalidatePath(`/clients/${existing.clientId}`);
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/audit");
}

// ============================================================
// Helper: authorize a payment and return it + its client
// ============================================================
async function getAuthorizedPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.deletedAt) return null;
  const client = await getAuthorizedClient(payment.clientId);
  if (!client) return null;
  return { payment, client };
}

function revalidatePaymentPaths(clientId: string) {
  revalidatePath("/payments");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/my");
  revalidatePath("/audit");
}

// ============================================================
// MARK a payment as received
// ============================================================
export async function markPaymentReceivedAction(formData: FormData) {
  const session = await requireSession();
  if (session.user.role === "client") throw new Error("read-only");

  const paymentId = String(formData.get("paymentId"));
  const found = await getAuthorizedPayment(paymentId);
  if (!found) throw new Error("payment not found");
  const { payment, client } = found;

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "received" },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "update",
    entityType: "Payment",
    entityId: paymentId,
    before: payment,
    after: updated,
  });

  revalidatePaymentPaths(payment.clientId);
}

// ============================================================
// EDIT a payment
// ============================================================
export async function editPaymentAction(formData: FormData) {
  const session = await requireSession();
  if (session.user.role === "client") throw new Error("read-only");

  const paymentId = String(formData.get("paymentId"));
  const found = await getAuthorizedPayment(paymentId);
  if (!found) throw new Error("payment not found");
  const { payment, client } = found;

  const amount = parseFloat(String(formData.get("amount")));
  const direction = String(formData.get("direction")) as "in" | "out";
  const status = String(formData.get("status")) as "pending" | "received";
  const date = new Date(String(formData.get("date")));
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!(amount > 0)) throw new Error("invalid amount");

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { amount, direction, status, date, notes },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "update",
    entityType: "Payment",
    entityId: paymentId,
    before: payment,
    after: updated,
  });

  revalidatePaymentPaths(payment.clientId);
}

// ============================================================
// DELETE (soft) a payment
// ============================================================
export async function deletePaymentAction(formData: FormData) {
  const session = await requireSession();
  if (session.user.role === "client") throw new Error("read-only");

  const paymentId = String(formData.get("paymentId"));
  const found = await getAuthorizedPayment(paymentId);
  if (!found) throw new Error("payment not found");
  const { payment, client } = found;

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { deletedAt: new Date() },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "soft_delete",
    entityType: "Payment",
    entityId: paymentId,
    before: payment,
    after: updated,
  });

  revalidatePaymentPaths(payment.clientId);
}

// ============================================================
// UPDATE a client — details + default commission
// ============================================================
export async function updateClientAction(formData: FormData) {
  const session = await requireSession();
  if (session.user.role === "client") throw new Error("read-only");

  const clientId = String(formData.get("clientId"));
  const client = await getAuthorizedClient(clientId);
  if (!client) throw new Error("client not found");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const defaultCommissionType = String(formData.get("defaultCommissionType") || "percentage") as "percentage" | "flat";
  const defaultCommissionValue = parseFloat(String(formData.get("defaultCommissionValue") || "0"));

  if (!name) throw new Error("name is required");
  if (!(defaultCommissionValue >= 0)) throw new Error("invalid commission value");

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { name, email, phone, defaultCommissionType, defaultCommissionValue },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "update",
    entityType: "Client",
    entityId: clientId,
    before: client,
    after: updated,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/edit`);
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/my");
  revalidatePath("/audit");
}
