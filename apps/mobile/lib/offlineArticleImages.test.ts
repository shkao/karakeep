import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings } from "./settings";
import { embedOfflineArticleImages } from "./offlineArticleImages";
import { linkBookmark } from "./testing/bookmarks";

const files = vi.hoisted(() => ({
  makeDirectoryAsync: vi.fn(),
  downloadAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

vi.mock("expo-file-system/legacy", () => ({
  ...files,
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
}));

const settings = {
  address: "https://keep.example.com/",
  apiKey: "test-key",
  customHeaders: { "X-Test": "image" },
} satisfies Pick<Settings, "address" | "apiKey" | "customHeaders">;

beforeEach(() => {
  vi.clearAllMocks();
  files.deleteAsync.mockResolvedValue(undefined);
  files.downloadAsync.mockResolvedValue({
    status: 200,
    mimeType: "image/png",
    uri: "file:///cache/image",
  });
  files.readAsStringAsync.mockResolvedValue("aW1hZ2U=");
});

describe("offline article images", () => {
  const html =
    '<figure><img alt="Treatment > baseline" src="https://keep.example.com/api/public/assets/chart?token=expired"><figcaption>Caption</figcaption></figure>';
  const bookmark = () => ({
    ...linkBookmark("article", { htmlContent: html }),
    assets: [{ id: "chart", assetType: "articleImage" as const }],
  });

  it("embeds authenticated image data so offline content has no expiring image URL", async () => {
    const original = bookmark();
    const result = await embedOfflineArticleImages(original, settings);
    expect(result.content).toMatchObject({
      htmlContent: html.replace(
        "https://keep.example.com/api/public/assets/chart?token=expired",
        "data:image/png;base64,aW1hZ2U=",
      ),
    });
    expect(original.content).toMatchObject({ htmlContent: html });
    expect(files.downloadAsync).toHaveBeenCalledWith(
      "https://keep.example.com/api/assets/chart",
      expect.any(String),
      { headers: { Authorization: "Bearer test-key", "X-Test": "image" } },
    );
    expect(files.deleteAsync).toHaveBeenCalledTimes(1);
    await embedOfflineArticleImages(result, settings);
    expect(files.downloadAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps the article text when an image cannot be saved", async () => {
    files.downloadAsync.mockResolvedValue({ status: 403 });
    const result = await embedOfflineArticleImages(bookmark(), settings);
    expect(result.content).toMatchObject({ htmlContent: html });
    expect(files.deleteAsync).toHaveBeenCalledTimes(1);
  });

  it("stops before downloading when sync is interrupted", async () => {
    await expect(
      embedOfflineArticleImages(bookmark(), settings, async () => {
        throw new Error("cancelled");
      }),
    ).rejects.toThrow("cancelled");
    expect(files.downloadAsync).not.toHaveBeenCalled();
  });
});
