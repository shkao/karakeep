import { expect, test } from "vitest";

import { resolveArticleImageUrls } from "./assetUtils";

test("resolves image sources when quoted attributes contain angle brackets", () => {
  const html =
    '<img alt="Treatment > baseline" src="/api/assets/chart"><p>Caption</p>';
  expect(
    resolveArticleImageUrls(
      html,
      ["chart"],
      (id) => `https://keep.example.com/${id}?token=test`,
    ),
  ).toBe(
    '<img alt="Treatment > baseline" src="https://keep.example.com/chart?token=test"><p>Caption</p>',
  );
});

test("only resolves the src attribute of images owned by the bookmark", () => {
  const html =
    '<img src="/api/assets/chart" data-src="/api/assets/other"><img src="/api/assets/foreign">';
  expect(
    resolveArticleImageUrls(
      html,
      ["chart", "other"],
      (id) => `https://keep.example.com/${id}`,
    ),
  ).toBe(
    '<img src="https://keep.example.com/chart" data-src="/api/assets/other"><img src="/api/assets/foreign">',
  );
});
