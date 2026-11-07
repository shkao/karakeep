import { expect, test } from "vitest";

import { estimateReadingMinutes } from "./readingTime";

test("estimates English articles at 230 words a minute", () => {
  const html = `<article><h1>Title</h1><p>${"word ".repeat(1150)}</p></article>`;
  expect(estimateReadingMinutes(html)).toBe(5);
});

test("counts characters for Chinese text", () => {
  expect(estimateReadingMinutes(`<p>${"字".repeat(1200)}</p>`)).toBe(3);
});

test("rounds short articles up to one minute and ignores empty ones", () => {
  expect(estimateReadingMinutes("<p>A few words</p>")).toBe(1);
  expect(estimateReadingMinutes("<img src='a.png'>")).toBeNull();
});
