/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.*s");

describe("requireAdmin", () => {
  it("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.admin.listPendingClaims, {})).rejects.toThrow(
      "NOT_AUTHENTICATED",
    );
  });

  it("rejects a signed-in user who is not an admin", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ subject: "clerk_ada", email: "ada@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(as.query(api.admin.listPendingClaims, {})).rejects.toThrow(
      "NOT_ADMIN",
    );
  });

  it("allows a user whose role is admin", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ subject: "clerk_ada", email: "ada@example.com" });
    const userId = await as.mutation(api.users.ensureUser, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { role: "admin" });
    });
    await expect(as.query(api.admin.listPendingClaims, {})).resolves.toEqual([]);
  });
});
