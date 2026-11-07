import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import serverConfig from "./config";
import { InferenceClientFactory } from "./inference";

const generateCalls: Record<string, unknown>[] = [];

vi.mock("ollama", () => ({
  Ollama: vi.fn().mockImplementation(function () {
    return {
      abort: vi.fn(),
      generate: vi.fn(async (body: Record<string, unknown>) => {
        generateCalls.push(body);
        return (async function* () {
          yield { response: "An article.", eval_count: 3 };
        })();
      }),
    };
  }),
}));

describe("Ollama inference", () => {
  const original = { ...serverConfig.inference };

  beforeEach(() => {
    generateCalls.length = 0;
    serverConfig.inference.openAIApiKey = undefined;
    serverConfig.inference.ollamaBaseUrl = "http://ollama:11434";
  });

  afterEach(() => {
    Object.assign(serverConfig.inference, original);
  });

  it("turns off thinking so reasoning can't use up the output budget", async () => {
    const client = InferenceClientFactory.build();

    const result = await client!.inferFromText("Write an article.", {});

    expect(result.response).toBe("An article.");
    expect(generateCalls[0]).toMatchObject({ think: false });
  });
});
