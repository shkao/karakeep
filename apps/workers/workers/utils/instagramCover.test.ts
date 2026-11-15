import { expect, test } from "vitest";

import { instagramEmbedUrl } from "./instagramCover";

test("maps posts and reels to their embed page", () => {
  expect(
    instagramEmbedUrl("https://www.instagram.com/p/DfXhLkVGMuh/?img_index=3"),
  ).toBe("https://www.instagram.com/p/DfXhLkVGMuh/embed/captioned/");
  expect(
    instagramEmbedUrl("https://instagram.com/reel/DehgzGJt7mJ/?mdxt=x"),
  ).toBe("https://www.instagram.com/reel/DehgzGJt7mJ/embed/captioned/");
  expect(
    instagramEmbedUrl("https://www.instagram.com/someone/p/DfXhLkVGMuh/"),
  ).toBe("https://www.instagram.com/p/DfXhLkVGMuh/embed/captioned/");
});

test("ignores profiles and other sites", () => {
  expect(instagramEmbedUrl("https://www.instagram.com/someone/")).toBeNull();
  expect(instagramEmbedUrl("https://example.com/p/abc/")).toBeNull();
  expect(instagramEmbedUrl("not a url")).toBeNull();
});
