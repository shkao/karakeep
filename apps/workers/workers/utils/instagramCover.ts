import type { BrowserContext } from "patchright";

const EMBED_IMAGE_TIMEOUT_MS = 8_000;

/**
 * The public embed page for an Instagram post or reel, or null for any other
 * URL. Its og:image is a center-cropped square; the embed has the full image.
 */
export function instagramEmbedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  if (host !== "instagram.com" && !host.endsWith(".instagram.com")) {
    return null;
  }
  const match = /^\/(?:[^/]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(
    parsed.pathname,
  );
  if (!match) {
    return null;
  }
  const kind = match[1] === "p" ? "p" : "reel";
  return `https://www.instagram.com/${kind}/${match[2]}/embed/captioned/`;
}

/**
 * Renders the post's embed page and returns its uncropped first image, or
 * null when it isn't an Instagram post or the image doesn't show up.
 */
export async function fetchInstagramCoverUrl(
  context: BrowserContext,
  url: string,
  abortSignal: AbortSignal,
): Promise<string | null> {
  const embedUrl = instagramEmbedUrl(url);
  if (!embedUrl || abortSignal.aborted) {
    return null;
  }
  const page = await context.newPage();
  // Closing the page makes the pending goto or wait reject at once.
  const onAbort = () => void page.close().catch(() => undefined);
  abortSignal.addEventListener("abort", onAbort, { once: true });
  try {
    // Only Instagram's own pages and CDN may load; nothing else on the way.
    await page.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      return /(^|\.)(instagram\.com|cdninstagram\.com|fbcdn\.net)$/.test(host)
        ? route.continue()
        : route.abort();
    });
    await page.goto(embedUrl, {
      waitUntil: "domcontentloaded",
      timeout: EMBED_IMAGE_TIMEOUT_MS,
    });
    const image = await page.waitForSelector("img.EmbeddedMediaImage", {
      timeout: EMBED_IMAGE_TIMEOUT_MS,
    });
    const src = await image.evaluate(
      (img) => (img as HTMLImageElement).currentSrc || img.getAttribute("src"),
    );
    return src?.startsWith("https://") ? src : null;
  } catch {
    return null;
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
    await page.close().catch(() => undefined);
  }
}
