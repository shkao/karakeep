import { describe, expect, it, test } from "vitest";

import type { ZBookmark } from "../types/bookmarks";
import { BookmarkTypes } from "../types/bookmarks";
import {
  cleanInstagramTitle,
  getBookmarkDisplayTitle,
  getBookmarkTitle,
  getTextDisplayTitle,
} from "./bookmarkUtils";

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

describe("getTextDisplayTitle", () => {
  it("uses the first non-empty line", () => {
    expect(getTextDisplayTitle("\n\n  \nFirst line\nSecond line")).toBe(
      "First line",
    );
  });

  it.each([
    ["# Heading", "Heading"],
    ["### Sub heading", "Sub heading"],
    ["> quoted", "quoted"],
    ["- item", "item"],
    ["* item", "item"],
    ["1. item", "item"],
    ["- [ ] todo", "todo"],
    ["- [x] done", "done"],
    ["**bold** and *italic*", "bold and italic"],
    ["__bold__ and _italic_", "bold and italic"],
    ["some `code` here", "some code here"],
    ["~~gone~~ kept", "gone kept"],
    ["[a link](https://example.com) here", "a link here"],
    ["![alt text](https://example.com/a.png)", "alt text"],
  ])("strips markers from %s", (input, expected) => {
    expect(getTextDisplayTitle(input)).toBe(expected);
  });

  it("leaves underscores and asterisks inside words alone", () => {
    expect(getTextDisplayTitle("snake_case_name and 2*3*4")).toBe(
      "snake_case_name and 2*3*4",
    );
  });

  it("skips fences and horizontal rules", () => {
    expect(getTextDisplayTitle("```ts\nconst a = 1;\n```")).toBe(
      "const a = 1;",
    );
    expect(getTextDisplayTitle("---\nAfter the rule")).toBe("After the rule");
  });

  it("truncates long lines with an ellipsis", () => {
    expect(getTextDisplayTitle("a".repeat(200), 10)).toBe(`${"a".repeat(10)}…`);
  });

  it("returns null when there's no text", () => {
    expect(getTextDisplayTitle("")).toBeNull();
    expect(getTextDisplayTitle("  \n\n---\n")).toBeNull();
  });
});

describe("getBookmarkDisplayTitle", () => {
  const withContent = (content: unknown, title: string | null = null) =>
    ({ title, content }) as unknown as ZBookmark;

  it("prefers the bookmark's own title", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.TEXT, text: "First line" }, "Mine"),
      ),
    ).toBe("Mine");
  });

  it("names an untitled note after its first line", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({
          type: BookmarkTypes.TEXT,
          text: "# UX review g6qqdx\nThe rest of it",
        }),
      ),
    ).toBe("UX review g6qqdx");
  });

  it("treats a blank title as no title", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.TEXT, text: "First line" }, "   "),
      ),
    ).toBe("First line");
    expect(
      getBookmarkDisplayTitle(
        withContent(
          { type: BookmarkTypes.LINK, url: "https://example.com" },
          "   ",
        ),
      ),
    ).toBe("https://example.com");
  });

  it("is null for a note with no text in it", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.TEXT, text: "" }),
      ),
    ).toBeNull();
  });

  it("falls back on a link's own title, then its URL", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({
          type: BookmarkTypes.LINK,
          title: "Crawled title",
          url: "https://example.com",
        }),
      ),
    ).toBe("Crawled title");
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.LINK, url: "https://example.com" }),
      ),
    ).toBe("https://example.com");
  });

  it("falls back on an asset's file name", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.ASSET, fileName: "scan.pdf" }),
      ),
    ).toBe("scan.pdf");
  });
});
