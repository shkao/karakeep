import type {
  ZPreferredLinkPreview,
  ZReaderViewReason,
  ZReaderViewStatus,
} from "@karakeep/shared/types/bookmarks";

interface LinkPreviewSignals {
  readerViewStatus: ZReaderViewStatus | null;
  readerViewReasons: ZReaderViewReason[] | null;
  crawlStatusCode: number | null;
  hasScreenshot: boolean;
}

/**
 * Whether the stored capture is a bot-challenge or verification page rather
 * than the requested content.
 */
export function isCaptureBlocked(
  readerViewReasons: ZReaderViewReason[] | null,
): boolean {
  return readerViewReasons?.includes("challenge_page") ?? false;
}

export function getPreferredLinkPreview({
  readerViewStatus,
  readerViewReasons,
  crawlStatusCode,
  hasScreenshot,
}: LinkPreviewSignals): ZPreferredLinkPreview {
  if (isCaptureBlocked(readerViewReasons)) {
    return "overview";
  }

  if (!readerViewStatus || readerViewStatus === "readable") {
    return "reader_view";
  }

  const crawlSucceeded =
    crawlStatusCode === null ||
    (crawlStatusCode >= 200 && crawlStatusCode <= 299);

  if (hasScreenshot && crawlSucceeded) {
    return "screenshot";
  }

  return "overview";
}
