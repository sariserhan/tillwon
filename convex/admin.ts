import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin.ts";

export const listPendingClaims = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return [];
  },
});
