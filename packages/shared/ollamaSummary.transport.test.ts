import { beforeEach, describe, expect, it, vi } from "vitest";

import { summarizeWithOllama } from "./ollamaSummary";

const { fetcher } = vi.hoisted(() => ({ fetcher: vi.fn() }));
vi.mock("./customFetch", () => ({ createCustomFetch: () => fetcher }));

const config = {
  baseUrl: "http://localhost:11434",
  textModel: "local-model",
  contextLength: 16384,
  maxOutputTokens: 2048,
  timeoutSec: 90,
};

describe("Ollama summary request cancellation", () => {
  beforeEach(() => {
    fetcher.mockReset().mockImplementation(
      (_input, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal!;
          if (signal.aborted) reject(signal.reason);
          else
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
        }),
    );
  });

  it("cancels an in-flight SDK request without starting an audit", async () => {
    const controller = new AbortController();
    const pending = summarizeWithOllama(
      "An article.",
      "English",
      [],
      config,
      controller.signal,
    );
    const assertion = expect(pending).rejects.toThrow("Job cancelled");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort(new Error("Job cancelled"));
    await assertion;
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("times out a pending SDK request", async () => {
    await expect(
      summarizeWithOllama("An article.", "English", [], {
        ...config,
        timeoutSec: 0.01,
      }),
    ).rejects.toThrow(/timeout|timed out/i);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
