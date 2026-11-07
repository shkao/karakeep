import type { ZBookmarkedLink } from "@karakeep/shared/types/bookmarks";

export function defaultLinkSection(
  url: string,
  readerViewStatus: ZBookmarkedLink["readerViewStatus"],
  rendererId: string | undefined,
  preferredPreview: ZBookmarkedLink["preferredPreview"],
): string {
  try {
    if (
      /(^|\.)instagram\.com$/.test(new URL(url).hostname) &&
      readerViewStatus !== "unavailable"
    ) {
      return "cached";
    }
  } catch {
    // Keep the usual default for invalid URLs.
  }

  if (rendererId) return rendererId;
  if (preferredPreview === "screenshot") return "screenshot";
  if (preferredPreview === "overview") return "overview";
  return "cached";
}
