// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { ZBookmarkedLink } from "@karakeep/shared/types/bookmarks";

import SavedPageOverview from "./SavedPageOverview";

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

const blockedLink = {
  type: "link",
  url: "https://mp.weixin.qq.com/s/abc",
  title: "Weixin Official Accounts Platform",
  description: "当前环境异常，完成验证后即可继续访问。",
  imageUrl: "https://example.com/verification.png",
  captureBlocked: true,
} as unknown as ZBookmarkedLink;

test("a blocked capture shows none of the verification page's details", () => {
  const view = render(
    <SavedPageOverview
      link={blockedLink}
      title="The real article"
      onSelectSection={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading").textContent).toBe("The real article");
  expect(screen.getByText("preview.capture_blocked")).toBeTruthy();
  expect(screen.queryByText(/Weixin Official Accounts Platform/)).toBeNull();
  expect(screen.queryByText(/当前环境异常/)).toBeNull();
  expect(view.container.querySelector('img[src*="verification"]')).toBeNull();
});

test("a blocked capture without a title of its own falls back to the host", () => {
  render(<SavedPageOverview link={blockedLink} onSelectSection={vi.fn()} />);

  expect(screen.getByRole("heading").textContent).toBe("mp.weixin.qq.com");
});
