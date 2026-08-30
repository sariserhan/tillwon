import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

const DOCUMENT_TYPES = new Set(["photo_id", "proof_of_address", "winner_photo"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
};

const ERROR_STATUS: Record<string, number> = {
  NOT_AUTHENTICATED: 401,
  NOT_ADMIN: 403,
  DOCUMENT_NOT_FOUND: 404,
};

/**
 * The only way a verification document's bytes are ever served. Replaces
 * `storage.getUrl()`, which returns an unauthenticated, non-expiring bearer
 * link once obtained — fine for a public winner photo, not for a government
 * ID. This route re-checks admin status on every request (via the same
 * requireAdmin every other admin function uses, reached through
 * getDocumentForServing) rather than trusting a link handed out once.
 */
http.route({
  path: "/documents",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const claimId = url.searchParams.get("claimId");
    const type = url.searchParams.get("type");
    if (claimId === null || type === null || !DOCUMENT_TYPES.has(type)) {
      return new Response("Bad request", { status: 400, headers: CORS_HEADERS });
    }

    let document: { storageId: Id<"_storage">; contentType: string | null };
    try {
      document = await ctx.runQuery(internal.admin.getDocumentForServing, {
        claimId: claimId as Id<"claims">,
        type: type as "photo_id" | "proof_of_address" | "winner_photo",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const status = ERROR_STATUS[message] ?? 400;
      return new Response(message || "Bad request", { status, headers: CORS_HEADERS });
    }

    const blob = await ctx.storage.get(document.storageId);
    if (blob === null) {
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    }

    return new Response(blob, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": document.contentType ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  }),
});

http.route({
  path: "/documents",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS_HEADERS })),
});

export default http;
