// The video download runs right after the crawl; past this, a missing video
// means it was skipped or failed, not that it's still coming.
const VIDEO_DOWNLOAD_GRACE_MS = 30 * 60 * 1000;

/**
 * Whether a video bookmark should stop waiting for its download: the crawl
 * failed, or it finished long enough ago. A recrawl resets the status to
 * pending but keeps the old crawledAt, so only a finished crawl can time out.
 */
export function hasVideoDownloadGivenUp({
  videoAssetId,
  crawlStatus,
  crawledAt,
  now,
}: {
  videoAssetId?: string | null;
  crawlStatus?: "success" | "failure" | "pending" | null;
  crawledAt?: Date | string | null;
  now: number;
}): boolean {
  if (videoAssetId) {
    return false;
  }
  if (crawlStatus === "failure") {
    return true;
  }
  return (
    crawlStatus === "success" &&
    !!crawledAt &&
    now - new Date(crawledAt).getTime() > VIDEO_DOWNLOAD_GRACE_MS
  );
}
