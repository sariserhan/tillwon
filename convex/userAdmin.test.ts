/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

async function asAdmin(t: ReturnType<typeof convexTest>) {
  const as = t.withIdentity({ subject: "clerk_admin", email: "admin@example.com" });
  const userId = await as.mutation(api.users.ensureUser, {});
  await t.run((ctx) => ctx.db.patch(userId, { role: "admin" }));
  return as;
}

describe("searchUserByEmail", () => {
  it("finds a user by exact email", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const as = t.withIdentity({ subject: "clerk_someone", email: "someone@example.com" });
    await as.mutation(api.users.ensureUser, {});

    const result = await admin.query(api.userAdmin.searchUserByEmail, {
      email: "someone@example.com",
    });
    expect(result).not.toBeNull();
    expect(result!.email).toBe("someone@example.com");
    expect(result!.accountStatus).toBe("active");
  });

  it("returns null for an email with no matching user", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);

    const result = await admin.query(api.userAdmin.searchUserByEmail, {
      email: "nobody@example.com",
    });
    expect(result).toBeNull();
  });

  it("refuses a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ subject: "clerk_user", email: "user@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(
      as.query(api.userAdmin.searchUserByEmail, { email: "user@example.com" }),
    ).rejects.toThrow("NOT_ADMIN");
  });
});

describe("setAccountStatus", () => {
  it("changes a user's accountStatus", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const as = t.withIdentity({ subject: "clerk_someone", email: "someone@example.com" });
    const userId = await as.mutation(api.users.ensureUser, {});

    await admin.mutation(api.userAdmin.setAccountStatus, {
      userId,
      status: "restricted",
      reason: "Suspicious spin pattern flagged manually",
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user!.accountStatus).toBe("restricted");
  });

  it("throws USER_NOT_FOUND for a nonexistent user", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const bogusId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        clerkId: "temp",
        email: "temp@example.com",
        emailVerified: true,
        ageVerified: true,
        accountStatus: "active",
        role: "user",
        fraudRiskScore: 0,
        marketingConsent: false,
        dailyReminderConsent: false,
        totalSpins: 0,
        totalPotentialWins: 0,
      });
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      admin.mutation(api.userAdmin.setAccountStatus, { userId: bogusId, status: "banned" }),
    ).rejects.toThrow("USER_NOT_FOUND");
  });

  it("writes an audit entry with before/after status and the reason in metadata", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const as = t.withIdentity({ subject: "clerk_someone", email: "someone@example.com" });
    const userId = await as.mutation(api.users.ensureUser, {});

    await admin.mutation(api.userAdmin.setAccountStatus, {
      userId,
      status: "banned",
      reason: "Confirmed fraud",
    });

    const entries = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) => q.eq("entityType", "users").eq("entityId", userId))
        .collect(),
    );
    const entry = entries.find((e) => e.action === "user.account_status_changed");
    expect(entry).toBeDefined();
    expect(entry!.before).toMatchObject({ accountStatus: "active" });
    expect(entry!.after).toMatchObject({ accountStatus: "banned" });
    expect(entry!.metadata).toMatchObject({ reason: "Confirmed fraud" });
  });

  it("refuses a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ subject: "clerk_user", email: "user@example.com" });
    const userId = await as.mutation(api.users.ensureUser, {});
    await expect(
      as.mutation(api.userAdmin.setAccountStatus, { userId, status: "restricted" }),
    ).rejects.toThrow("NOT_ADMIN");
  });
});
