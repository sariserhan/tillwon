import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

describe("users", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(t.mutation(api.users.ensureUser, {})).rejects.toThrow(
      "NOT_AUTHENTICATED",
    );
  });

  it("creates a user row on first call", async () => {
    const asAda = t.withIdentity({
      subject: "clerk_ada",
      email: "ada@example.com",
      emailVerified: true,
    });
    const id = await asAda.mutation(api.users.ensureUser, {});
    expect(id).toBeTypeOf("string");

    const user = await asAda.query(api.users.getCurrentUser, {});
    expect(user).toMatchObject({
      email: "ada@example.com",
      emailVerified: true,
      accountStatus: "active",
      role: "user",
      totalSpins: 0,
    });
  });

  it("is idempotent — a second call returns the same row", async () => {
    const asAda = t.withIdentity({ subject: "clerk_ada", email: "ada@example.com" });
    const first = await asAda.mutation(api.users.ensureUser, {});
    const second = await asAda.mutation(api.users.ensureUser, {});
    expect(second).toEqual(first);
  });

  it("keeps users separate by Clerk subject", async () => {
    const asAda = t.withIdentity({ subject: "clerk_ada", email: "ada@example.com" });
    const asGrace = t.withIdentity({ subject: "clerk_grace", email: "grace@example.com" });
    const a = await asAda.mutation(api.users.ensureUser, {});
    const g = await asGrace.mutation(api.users.ensureUser, {});
    expect(a).not.toEqual(g);
  });
});
