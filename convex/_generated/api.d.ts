/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as balances from "../balances.js";
import type * as campaigns from "../campaigns.js";
import type * as claims from "../claims.js";
import type * as eligibility from "../eligibility.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_jurisdictions from "../lib/jurisdictions.js";
import type * as lib_reels from "../lib/reels.js";
import type * as lib_resetDate from "../lib/resetDate.js";
import type * as lib_symbols from "../lib/symbols.js";
import type * as lib_tiers from "../lib/tiers.js";
import type * as rules from "../rules.js";
import type * as seed from "../seed.js";
import type * as spins from "../spins.js";
import type * as users from "../users.js";
import type * as winnerEngine from "../winnerEngine.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  balances: typeof balances;
  campaigns: typeof campaigns;
  claims: typeof claims;
  eligibility: typeof eligibility;
  "lib/admin": typeof lib_admin;
  "lib/audit": typeof lib_audit;
  "lib/jurisdictions": typeof lib_jurisdictions;
  "lib/reels": typeof lib_reels;
  "lib/resetDate": typeof lib_resetDate;
  "lib/symbols": typeof lib_symbols;
  "lib/tiers": typeof lib_tiers;
  rules: typeof rules;
  seed: typeof seed;
  spins: typeof spins;
  users: typeof users;
  winnerEngine: typeof winnerEngine;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
