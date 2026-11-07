// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";

import {
  createSignedToken,
  getAlignedExpiry,
  verifySignedToken,
} from "@karakeep/shared/signedTokens";

import ReaderView from "./ReaderView";

const { getBookmark } = vi.hoisted(() => ({ getBookmark: vi.fn() }));

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    highlights: {
      getForBookmark: {
        queryOptions: () => ({
          queryKey: ["highlights"],
          queryFn: async () => ({ highlights: [] }),
        }),
      },
    },
    bookmarks: {
      getBookmark: {
        queryOptions: (_input: unknown, options: object) => ({
          queryKey: ["bookmark"],
          queryFn: getBookmark,
          ...options,
        }),
      },
    },
  }),
}));
vi.mock("@karakeep/shared-react/hooks/highlights", () => ({
  useCreateHighlight: () => ({ mutate: vi.fn() }),
  useUpdateHighlight: () => ({ mutate: vi.fn() }),
  useDeleteHighlight: () => ({ mutate: vi.fn() }),
}));
vi.mock("@karakeep/shared-react/hooks/reading-progress", () => ({
  useReadingProgress: () => ({ showBanner: false }),
}));
vi.mock("@karakeep/shared-react/components/ScrollProgressTracker", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@karakeep/shared-react/components/BookmarkHtmlHighlighter", () => ({
  default: ({ htmlContent }: { htmlContent: string }) => (
    <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
  ),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T10:44:00Z"));
  getBookmark.mockReset().mockImplementation(async () => {
    const token = createSignedToken(
      { assetId: "chart" },
      "test-secret",
      getAlignedExpiry(4 * 3600, 3 * 3600),
    );
    return {
      content: {
        type: "link",
        htmlContent: `<img src="https://example.com/api/public/assets/chart?token=${token}">`,
      },
    };
  });
});

afterEach(() => vi.useRealTimers());

test("refreshes saved image URLs while the reader stays open", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ReaderView bookmarkId="bookmark" readOnly />
    </QueryClientProvider>,
  );
  await act(async () => vi.advanceTimersByTimeAsync(1));
  await act(async () => vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000));
  const image = screen.getByRole("img") as HTMLImageElement;
  const token = new URL(image.src).searchParams.get("token")!;
  expect(
    verifySignedToken(token, "test-secret", z.object({ assetId: z.string() })),
  ).toEqual({ assetId: "chart" });
  expect(getBookmark.mock.calls.length).toBeGreaterThan(1);
  view.unmount();
  client.clear();
});

test("refreshes once when a saved image fails", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ReaderView bookmarkId="bookmark" readOnly />
    </QueryClientProvider>,
  );
  await act(async () => vi.advanceTimersByTimeAsync(1));
  const image = screen.getByRole("img");
  await act(async () => fireEvent.error(image));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  await act(async () => fireEvent.error(image));
  expect(getBookmark).toHaveBeenCalledTimes(2);
  view.unmount();
  client.clear();
});
