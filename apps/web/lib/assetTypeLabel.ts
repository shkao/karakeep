import type { TFunction } from "i18next";

import type { ZAssetType } from "@karakeep/shared/types/bookmarks";

/**
 * The display name of an attachment type. One literal key per case: a
 * template-string key over every asset type is a union that the i18next key
 * types reject inconsistently.
 */
export function assetTypeLabel(t: TFunction, type: ZAssetType): string {
  switch (type) {
    case "linkHtmlContent":
      return t("preview.attachments.types.linkHtmlContent");
    case "articleImage":
      return t("preview.attachments.types.articleImage");
    case "screenshot":
      return t("preview.attachments.types.screenshot");
    case "pdf":
      return t("preview.attachments.types.pdf");
    case "assetScreenshot":
      return t("preview.attachments.types.assetScreenshot");
    case "bannerImage":
      return t("preview.attachments.types.bannerImage");
    case "fullPageArchive":
      return t("preview.attachments.types.fullPageArchive");
    case "video":
      return t("preview.attachments.types.video");
    case "bookmarkAsset":
      return t("preview.attachments.types.bookmarkAsset");
    case "precrawledArchive":
      return t("preview.attachments.types.precrawledArchive");
    case "userUploaded":
      return t("preview.attachments.types.userUploaded");
    case "avatar":
      return t("preview.attachments.types.avatar");
    case "unknown":
      return t("preview.attachments.types.unknown");
  }
}
