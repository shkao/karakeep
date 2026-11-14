import { describe, expect, test } from "vitest";

import type { ZBookmark } from "../types/bookmarks";
import { BookmarkTypes } from "../types/bookmarks";
import { cleanInstagramTitle, getBookmarkTitle } from "./bookmarkUtils";

describe("cleanInstagramTitle", () => {
  test("keeps only the caption", () => {
    expect(
      cleanInstagramTitle(
        "MIT Sloan School of Management on Instagram: “What skills make you uniquely valuable in the age of artificial intelligence?”",
      ),
    ).toBe(
      "What skills make you uniquely valuable in the age of artificial intelligence?",
    );
  });

  test("drops trailing hashtags and handles a cut-off caption", () => {
    expect(
      cleanInstagramTitle(
        "Carmen Vicente on Instagram: “What are the non-technical skills you try to hone? #creatoreconomy #nonlinearcareer",
      ),
    ).toBe("What are the non-technical skills you try to hone?");
  });

  test("accepts straight quotes", () => {
    expect(
      cleanInstagramTitle('Thomas Kim on Instagram: "AI coding skills"'),
    ).toBe("AI coding skills");
  });

  test("keeps a caption made only of hashtags", () => {
    expect(cleanInstagramTitle("Someone on Instagram: “#travel #food”")).toBe(
      "#travel #food",
    );
  });

  test("leaves other titles alone", () => {
    expect(cleanInstagramTitle("Instagram")).toBe("Instagram");
    expect(
      cleanInstagramTitle("NASA (@nasa) • Instagram photos and videos"),
    ).toBe("NASA (@nasa) • Instagram photos and videos");
  });
});

describe("getBookmarkTitle", () => {
  const link = (url: string, title: string, userTitle: string | null = null) =>
    ({
      title: userTitle,
      content: { type: BookmarkTypes.LINK, url, title },
    }) as unknown as ZBookmark;

  test("cleans Instagram titles", () => {
    expect(
      getBookmarkTitle(
        link(
          "https://www.instagram.com/reel/DePGBFXtswr/",
          "Thomas Kim on Instagram: “These are my essential AI coding skills”",
        ),
      ),
    ).toBe("These are my essential AI coding skills");
  });

  test("ignores the verification page's title on a blocked capture", () => {
    const blocked = {
      title: null,
      content: {
        type: BookmarkTypes.LINK,
        url: "https://mp.weixin.qq.com/s/abc",
        title: "Weixin Official Accounts Platform",
        captureBlocked: true,
      },
    } as unknown as ZBookmark;
    expect(getBookmarkTitle(blocked)).toBe("mp.weixin.qq.com");
    expect(getBookmarkTitle({ ...blocked, title: "Real title" })).toBe(
      "Real title",
    );
  });

  test("keeps a title the user set", () => {
    expect(
      getBookmarkTitle(
        link(
          "https://www.instagram.com/reel/x/",
          "A on Instagram: “caption”",
          "My title",
        ),
      ),
    ).toBe("My title");
  });

  test("leaves the same pattern on other sites alone", () => {
    const title = "Someone on Instagram: “quoted elsewhere”";
    expect(getBookmarkTitle(link("https://example.com/post", title))).toBe(
      title,
    );
  });
});
