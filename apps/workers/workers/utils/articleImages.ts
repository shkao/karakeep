import { load } from "cheerio";

import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

export function getCapturedArticleImageSources(
  html: string,
): Map<string, string> {
  const $ = load(html, null, false);
  const sources = new Map<string, string>();
  for (const image of $("img[data-original-src]").toArray()) {
    const source = $(image).attr("data-original-src");
    const id = $(image)
      .attr("src")
      ?.match(/^\/api\/assets\/([\w-]+)$/)?.[1];
    if (source && id) {
      sources.set(source, id);
    }
  }
  return sources;
}

export async function captureArticleImages(
  html: string,
  saveImage: (url: string) => Promise<string | null>,
  concurrency = 1,
): Promise<string> {
  const $ = load(html, null, false);
  const savedImages = new Map<string, string | null>();
  // Embedded images are already self-contained. Unsupported protocols stay
  // untouched and are never passed to the downloader.
  const sources = [
    ...new Set(
      $("img")
        .toArray()
        .map((image) => $(image).attr("src"))
        .filter((src): src is string => !!src && /^https?:\/\//i.test(src)),
    ),
  ];
  let next = 0;
  // Wait for every worker before failing so no save finishes after the caller
  // has cleaned up.
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, sources.length) }, async () => {
      while (next < sources.length) {
        const src = sources[next++];
        savedImages.set(src, await saveImage(src));
      }
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    throw failure.reason;
  }
  for (const image of $("img").toArray()) {
    const src = $(image).attr("src");
    if (!src) {
      continue;
    }
    const assetId = savedImages.get(src);
    if (assetId) {
      $(image)
        .attr("data-original-src", src)
        .attr("src", getAssetUrl(assetId))
        .removeAttr("srcset");
      // A picture source would otherwise override the stored img source.
      $(image).parent("picture").find("source").remove();
    }
  }
  return $.html();
}
