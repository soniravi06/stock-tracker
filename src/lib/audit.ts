import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

type LogArgs = {
  actorUserId: string;
  actorRole: Role;
  onBehalfOfAdminId?: string | null;
  action: "create" | "update" | "soft_delete" | "restore";
  entityType: "Client" | "Transaction" | "CompletedTrade" | "Payment" | "User";
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
};

function inrFmt(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function generateSummary(args: LogArgs): string {
  const { action, entityType, before, after } = args;
  const b = before as Record<string, unknown> | undefined;
  const a = after as Record<string, unknown> | undefined;

  if (action === "create") {
    if (entityType === "CompletedTrade" && a) {
      return `Sold ${a.sellQty} ${a.symbol} @ ${inrFmt(a.sellPricePerShare as number)} — net P&L ${inrFmt(a.netPnL as number)}`;
    }
    if (entityType === "Transaction" && a) {
      return `Bought ${a.quantity} ${a.symbol} @ ${inrFmt(a.pricePerShare as number)}`;
    }
    if (entityType === "Payment" && a) {
      return `${a.direction === "in" ? "Deposit" : "Withdrawal"} of ${inrFmt(a.amount as number)} (${a.status})`;
    }
    if (entityType === "Client" && a) {
      return `Created client "${a.name}"`;
    }
    if (entityType === "User" && a) {
      return `Created user ${a.email} with role ${a.role}`;
    }
    return `Created ${entityType}`;
  }

  if (action === "soft_delete") {
    if (entityType === "CompletedTrade" && b) {
      return `Deleted ${b.symbol} trade (${b.sellQty} shares @ ${inrFmt(b.sellPricePerShare as number)}) — lots restored`;
    }
    if (entityType === "Transaction" && b) {
      return `Deleted buy lot: ${b.quantity} ${b.symbol} @ ${inrFmt(b.pricePerShare as number)}`;
    }
    return `Deleted ${entityType}`;
  }

  if (action === "update" && b && a) {
    const changes: string[] = [];

    const moneyFields: Record<string, string> = {
      sellPricePerShare: "sell price",
      pricePerShare: "buy price",
      commissionAmount: "commission amount",
      netPnL: "net P&L",
      grossPnL: "gross P&L",
      amount: "amount",
    };

    const pctOrFlatField = "commissionValue";
    if (pctOrFlatField in b && pctOrFlatField in a && b[pctOrFlatField] !== a[pctOrFlatField]) {
      const bVal = b[pctOrFlatField] as number;
      const aVal = a[pctOrFlatField] as number;
      const isPercent = a.commissionType === "percentage";
      changes.push(
        isPercent
          ? `commission ${bVal}% → ${aVal}%`
          : `commission ${inrFmt(bVal)} flat → ${inrFmt(aVal)} flat`
      );
    }

    for (const [field, label] of Object.entries(moneyFields)) {
      if (field in b && field in a && b[field] !== a[field]) {
        changes.push(`${label} ${inrFmt(b[field] as number)} → ${inrFmt(a[field] as number)}`);
      }
    }

    const plainFields: Record<string, string> = {
      commissionType: "commission type",
      status: "status",
      direction: "direction",
      notes: "notes",
      quantity: "quantity",
      sellQty: "sell qty",
    };
    for (const [field, label] of Object.entries(plainFields)) {
      if (field in b && field in a && b[field] !== a[field]) {
        changes.push(`${label} "${b[field]}" → "${a[field]}"`);
      }
    }

    const entityLabel =
      entityType === "CompletedTrade"
        ? `${(b.symbol as string) ?? ""} completed trade`
        : entityType === "Transaction"
        ? `${(b.symbol as string) ?? ""} buy lot`
        : entityType;

    if (changes.length === 0) return `Updated ${entityLabel}`;
    return `Updated ${entityLabel}: ${changes.join(", ")}`;
  }

  if (action === "restore") return `Restored ${entityType}`;

  return `${action} ${entityType}`;
}

export async function writeAudit(args: LogArgs) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: args.actorUserId,
        actorRole: args.actorRole,
        onBehalfOfAdminId: args.onBehalfOfAdminId ?? null,
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        beforeJson: args.before ? JSON.stringify(args.before) : null,
        afterJson: args.after ? JSON.stringify(args.after) : null,
        summary: generateSummary(args),
        ipAddress: args.ipAddress ?? null,
      },
    });
  } catch (e) {
    // Audit failures must never block the primary action.
    // Most common cause: stale JWT after a DB reset (actorUserId no longer exists).
    console.error("[audit] write failed:", e);
  }
}
