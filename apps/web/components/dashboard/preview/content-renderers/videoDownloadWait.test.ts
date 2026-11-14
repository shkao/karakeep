import { expect, test } from "vitest";

import { hasVideoDownloadGivenUp } from "./videoDownloadWait";

const now = Date.parse("2026-11-14T12:00:00Z");
const minutesAgo = (m: number) => new Date(now - m * 60 * 1000);

test("keeps waiting shortly after a successful crawl", () => {
  expect(
    hasVideoDownloadGivenUp({
      crawlStatus: "success",
      crawledAt: minutesAgo(5),
      now,
    }),
  ).toBe(false);
});

test("gives up once a finished crawl is past the grace period", () => {
  expect(
    hasVideoDownloadGivenUp({
      crawlStatus: "success",
      crawledAt: minutesAgo(31),
      now,
    }),
  ).toBe(true);
});

test("gives up at once when the crawl failed", () => {
  expect(hasVideoDownloadGivenUp({ crawlStatus: "failure", now })).toBe(true);
});

test("keeps waiting during a recrawl despite an old crawledAt", () => {
  expect(
    hasVideoDownloadGivenUp({
      crawlStatus: "pending",
      crawledAt: minutesAgo(120),
      now,
    }),
  ).toBe(false);
});

test("never gives up once the video exists", () => {
  expect(
    hasVideoDownloadGivenUp({
      videoAssetId: "v",
      crawlStatus: "failure",
      now,
    }),
  ).toBe(false);
});
