import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireUser } from "../users.ts";

/**
 * Every admin-only function starts here. A signed-in user who isn't an admin
 * gets the same treatment as a signed-out one would from requireUser: a typed
 * error, never a silent null or an empty result that could be mistaken for
 * "you're an admin, there's just nothing to see."
 */
export async function requireAdmin(ctx: MutationCtx | QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin" && user.role !== "superadmin") {
    throw new Error("NOT_ADMIN");
  }
  return user;
}
