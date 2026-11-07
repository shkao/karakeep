// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import ReadingProgressBanner from "./ReadingProgressBanner";

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("dismisses after eight seconds", () => {
  const dismiss = vi.fn();
  const view = render(
    <ReadingProgressBanner onContinue={vi.fn()} onDismiss={dismiss} />,
  );
  act(() => vi.advanceTimersByTime(7999));
  expect(dismiss).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(dismiss).toHaveBeenCalledOnce();
  view.unmount();
});

test("pauses the remaining time while hovered or focused", () => {
  const dismiss = vi.fn();
  const view = render(
    <ReadingProgressBanner onContinue={vi.fn()} onDismiss={dismiss} />,
  );
  const banner = screen.getByText("preview.continue_reading").parentElement!;
  act(() => vi.advanceTimersByTime(3000));
  fireEvent.mouseEnter(banner);
  act(() => vi.advanceTimersByTime(10000));
  expect(dismiss).not.toHaveBeenCalled();
  fireEvent.focus(
    screen.getByRole("button", { name: "preview.continue_button" }),
  );
  fireEvent.mouseLeave(banner);
  act(() => vi.advanceTimersByTime(10000));
  expect(dismiss).not.toHaveBeenCalled();
  fireEvent.blur(
    screen.getByRole("button", { name: "preview.continue_button" }),
  );
  act(() => vi.advanceTimersByTime(5000));
  expect(dismiss).toHaveBeenCalledOnce();
  view.unmount();
});
