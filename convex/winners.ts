import { query } from "./_generated/server";

/**
 * The one public read `/winners` needs. Everything on `winnerArchive` is
 * already exactly what the product is allowed to publish, so this returns
 * the whole row (plus a resolved photo URL) rather than picking fields —
 * unlike `getActiveCampaign`, there is no sealed secret anywhere near this
 * table to accidentally leak.
 */
export const listWinners = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("winnerArchive").order("desc").collect();
    return await Promise.all(
      rows.map(async (row) => ({
        publicDisplayName: row.publicDisplayName,
        photoUrl: await ctx.storage.getUrl(row.photoStorageId),
        region: row.region,
        prizeTitle: row.prizeTitle,
        awardedAt: row.awardedAt,
        revealedTarget: row.revealedTarget,
        revealedNonce: row.revealedNonce,
        commitmentHash: row.commitmentHash,
      })),
    );
  },
});
