// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import SummaryReader from "./SummaryReader";

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/readerSettings", () => ({
  useReaderSettings: () => ({
    settings: { fontFamily: "sans", fontSize: 18, lineHeight: 1.6 },
  }),
}));
vi.mock("@/components/ui/markdown/markdown-readonly", () => ({
  MarkdownReadonly: ({ children }: { children: string }) => <p>{children}</p>,
}));
vi.mock("../bookmarks/SummarizeBookmarkArea", () => ({
  default: () => <button>summarize</button>,
}));

afterEach(cleanup);

const post = (summary: string | null) =>
  ({
    id: "b",
    summary,
    content: {
      type: "link",
      url: "https://www.instagram.com/p/x/",
      title: "A on Instagram",
      description: "The caption.",
      imageUrl: "https://example.com/cover.jpg",
    },
  }) as unknown as ZBookmark;

test("reads the AI summary when there is one", () => {
  render(<SummaryReader bookmark={post("The summary.")} readOnly={false} />);

  expect(screen.getByText("The summary.")).toBeTruthy();
  expect(screen.queryByText("summarize")).toBeNull();
  expect(screen.getByText("preview.open_original")).toBeTruthy();
});

test("falls back to the caption and offers to summarize", () => {
  render(<SummaryReader bookmark={post(null)} readOnly={false} />);

  expect(screen.getByText("The caption.")).toBeTruthy();
  expect(screen.getByText("summarize")).toBeTruthy();
});
