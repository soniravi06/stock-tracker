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

export async function writeAudit(args: LogArgs) {
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
      ipAddress: args.ipAddress ?? null,
    },
  });
}
