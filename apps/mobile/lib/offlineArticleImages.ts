import * as FileSystem from "expo-file-system/legacy";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { IMAGE_ASSET_TYPES } from "@karakeep/shared/assetdb";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import type { Settings } from "./settings";
import { buildApiHeaders } from "./utils";

export async function embedOfflineArticleImages(
  bookmark: ZBookmark,
  settings: Pick<Settings, "address" | "apiKey" | "customHeaders">,
  checkpoint?: () => Promise<void>,
): Promise<ZBookmark> {
  if (
    bookmark.content.type !== BookmarkTypes.LINK ||
    !bookmark.content.htmlContent
  ) {
    return bookmark;
  }
  let html = bookmark.content.htmlContent;
  for (const asset of bookmark.assets.filter(
    (asset) => asset.assetType === "articleImage",
  )) {
    // Already embedded images need no network access when saving a cached copy.
    const sourcePattern = new RegExp(
      `(<img\\b(?:[^">]|"[^"]*")*?\\ssrc=")https?://[^"\\s]+/public/assets/${asset.id}\\?[^"\\s]*(")`,
      "g",
    );
    if (!sourcePattern.test(html)) {
      continue;
    }
    await checkpoint?.();
    if (!FileSystem.cacheDirectory) {
      throw new Error("Temporary storage is not available on this device");
    }
    const directory = `${FileSystem.cacheDirectory}article-image-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    try {
      const result = await FileSystem.downloadAsync(
        `${settings.address.replace(/\/$/, "")}${getAssetUrl(asset.id)}`,
        `${directory}image`,
        { headers: buildApiHeaders(settings.apiKey, settings.customHeaders) },
      );
      const contentType =
        result.mimeType ??
        Object.entries(result.headers ?? {}).find(
          ([name]) => name.toLowerCase() === "content-type",
        )?.[1];
      const mimeType = contentType?.split(";")[0].trim().toLowerCase();
      if (
        result.status !== 200 ||
        !mimeType ||
        !IMAGE_ASSET_TYPES.has(mimeType)
      ) {
        throw new Error(
          "Could not download an article image for offline reading.",
        );
      }
      await checkpoint?.();
      const base64 = await FileSystem.readAsStringAsync(result.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      html = html.replace(
        sourcePattern,
        `$1data:${mimeType};base64,${base64}$2`,
      );
    } finally {
      await FileSystem.deleteAsync(directory, { idempotent: true });
    }
  }
  return { ...bookmark, content: { ...bookmark.content, htmlContent: html } };
}
