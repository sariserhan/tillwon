import type { MutationCtx } from "../_generated/server";

/**
 * The single writer for audit entries. Every admin mutation and every campaign
 * state change calls this; a mutation that changes campaign state without calling
 * it is a review failure, because the trail is the only way a decision can be
 * reconstructed a year later.
 */
export async function writeAudit(
  ctx: MutationCtx,
  entry: {
    actorType: "user" | "admin" | "sponsor" | "system";
    actorId?: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", entry);
}
