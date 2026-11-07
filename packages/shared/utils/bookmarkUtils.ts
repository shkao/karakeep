import { BookmarkTypes, ZBookmark, ZBookmarkedLink } from "../types/bookmarks";
import { getAssetUrl } from "./assetUtils";

export function getBookmarkLinkAssetIdOrUrl(bookmark: ZBookmarkedLink) {
  if (bookmark.imageAssetId) {
    return { assetId: bookmark.imageAssetId, localAsset: true as const };
  }
  if (bookmark.screenshotAssetId) {
    return { assetId: bookmark.screenshotAssetId, localAsset: true as const };
  }
  return bookmark.imageUrl
    ? { url: bookmark.imageUrl, localAsset: false as const }
    : null;
}

export function getBookmarkLinkImageUrl(bookmark: ZBookmarkedLink) {
  const assetOrUrl = getBookmarkLinkAssetIdOrUrl(bookmark);
  if (!assetOrUrl) {
    return null;
  }
  if (!assetOrUrl.localAsset) {
    return assetOrUrl;
  }
  return {
    url: getAssetUrl(assetOrUrl.assetId),
    localAsset: true,
  };
}

export function isBookmarkStillCrawling(bookmark: ZBookmark) {
  if (bookmark.content.type != BookmarkTypes.LINK) {
    return false;
  }
  if (bookmark.content.crawlStatus) {
    return bookmark.content.crawlStatus === "pending";
  }
  return !bookmark.content.crawledAt;
}

export function isBookmarkStillTagging(bookmark: ZBookmark) {
  return bookmark.taggingStatus == "pending";
}

export function isBookmarkStillSummarizing(bookmark: ZBookmark) {
  return bookmark.summarizationStatus == "pending";
}

export function isBookmarkStillLoading(bookmark: ZBookmark) {
  return (
    isBookmarkStillTagging(bookmark) ||
    isBookmarkStillCrawling(bookmark) ||
    isBookmarkStillSummarizing(bookmark)
  );
}

export function getBookmarkRefreshInterval(
  bookmark: ZBookmark,
): number | false {
  if (!isBookmarkStillLoading(bookmark)) {
    return false;
  }

  // For the first 30 seconds, we'll refresh the bookmark every second
  if (Date.now().valueOf() - bookmark.createdAt.valueOf() < 30 * 1000) {
    return 1000;
  }

  // Then, we'll refresh it every 10 seconds after than for 10mins
  if (Date.now().valueOf() - bookmark.createdAt.valueOf() < 10 * 60 * 1000) {
    return 10_000;
  }

  // Then, we'll refresh it every minute after than for 6hrs
  if (
    Date.now().valueOf() - bookmark.createdAt.valueOf() <
    6 * 60 * 60 * 1000
  ) {
    return 60_000;
  }

  // Then we'll stop refreshing it
  return false;
}

export function getSourceUrl(bookmark: ZBookmark) {
  if (bookmark.content.type === BookmarkTypes.LINK) {
    return bookmark.content.url;
  }
  if (bookmark.content.type === BookmarkTypes.ASSET) {
    return bookmark.content.sourceUrl ?? null;
  }
  if (bookmark.content.type === BookmarkTypes.TEXT) {
    return bookmark.content.sourceUrl ?? null;
  }
  return null;
}

const INSTAGRAM_TITLE = /^.+? on Instagram: ["“]([\s\S]*?)["”]?$/;
const TRAILING_HASHTAGS = /(\s+#[\p{L}\p{N}_]+)+\s*$/u;
const ONLY_HASHTAGS = /^#[\p{L}\p{N}_]+$/u;

/**
 * Instagram page titles read `Name on Instagram: “caption”`. Returns just the
 * caption, without trailing hashtags, or the title unchanged if it doesn't
 * match that pattern.
 */
export function cleanInstagramTitle(title: string) {
  const caption = INSTAGRAM_TITLE.exec(title)?.[1].trim();
  if (!caption) {
    return title;
  }
  const withoutHashtags = caption.replace(TRAILING_HASHTAGS, "").trim();
  // A caption of only hashtags keeps them all.
  return ONLY_HASHTAGS.test(withoutHashtags) ? caption : withoutHashtags;
}

function isInstagramUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

export function getBookmarkTitle(bookmark: ZBookmark) {
  let title: string | null = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      title = bookmark.content.title ?? bookmark.content.url;
      if (bookmark.content.title && isInstagramUrl(bookmark.content.url)) {
        title = cleanInstagramTitle(bookmark.content.title);
      }
      break;
    case BookmarkTypes.TEXT:
      title = null;
      break;
    case BookmarkTypes.ASSET:
      title = bookmark.content.fileName ?? null;
      break;
  }

  return bookmark.title ? bookmark.title : title;
}
