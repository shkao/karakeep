import { describe, expect, test, vi } from "vitest";

import { extractArticleTitle } from "./videoArticleWorker";

vi.mock("@karakeep/db", async (original) => {
  const actual = await original<typeof import("@karakeep/db")>();
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return { ...actual, db: getInMemoryDB(true) };
});

describe("extractArticleTitle", () => {
  test("returns the first level-one heading", () => {
    expect(
      extractArticleTitle(
        "# Five Non-Technical Skills\n\nIntro.\n\n## Key takeaways",
      ),
    ).toBe("Five Non-Technical Skills");
  });

  test("ignores level-two headings and closing hashes", () => {
    expect(extractArticleTitle("## Not a title\n# Real title #\n")).toBe(
      "Real title",
    );
  });

  test("returns null without a title", () => {
    expect(extractArticleTitle("Just a paragraph.")).toBeNull();
  });
});
