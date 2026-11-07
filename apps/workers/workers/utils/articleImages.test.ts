import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";

import {
  captureArticleImages,
  getCapturedArticleImageSources,
} from "./articleImages";

describe("captureArticleImages", () => {
  it("saves duplicate image sources once and keeps figures and captions", async () => {
    const save = vi.fn(async () => "saved-image");
    const html = await captureArticleImages(
      '<figure><img src="https://example.com/chart.png" srcset="https://example.com/chart-large.png 2x" alt="Chart"><figcaption>Caption</figcaption></figure><img src="https://example.com/chart.png">',
      save,
    );
    const $ = load(html);
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      $("img")
        .map((_, img) => $(img).attr("src"))
        .get(),
    ).toEqual(["/api/assets/saved-image", "/api/assets/saved-image"]);
    expect($("img").attr("srcset")).toBeUndefined();
    expect($("img").attr("alt")).toBe("Chart");
    expect($("figcaption").text()).toBe("Caption");
    expect(
      getCapturedArticleImageSources(html).get("https://example.com/chart.png"),
    ).toBe("saved-image");
  });

  it("keeps remote fallbacks and embedded images when capture fails", async () => {
    const save = vi.fn(async () => null);
    const html = await captureArticleImages(
      '<img src="https://example.com/missing.png"><img src="data:image/png;base64,abc">',
      save,
    );
    const $ = load(html);
    expect($("img").first().attr("src")).toBe(
      "https://example.com/missing.png",
    );
    expect($("img").last().attr("src")).toBe("data:image/png;base64,abc");
    expect(save).toHaveBeenCalledTimes(1);
  });
});
