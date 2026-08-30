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

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
};

/**
 * Defense in depth beyond serving the sniffed (not client-declared)
 * Content-Type: `nosniff` stops the browser from second-guessing it,
 * `Content-Disposition: attachment` asks it to download rather than render
 * inline, and the CSP/sandbox pair means even a file that somehow still
 * carried executable content couldn't run script in this response's
 * context. None of this is a substitute for serving an honest
 * Content-Type — it's a second layer in case that ever regresses.
 */
function documentHeaders(contentType: string) {
  const extension = EXTENSIONS[contentType] ?? "bin";
  return {
    ...CORS_HEADERS,
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="document.${extension}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
}

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

    let document: { storageId: Id<"_storage">; contentType: string };
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

    return new Response(blob, { status: 200, headers: documentHeaders(document.contentType) });
  }),
});

http.route({
  path: "/documents",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS_HEADERS })),
});

export default http;
