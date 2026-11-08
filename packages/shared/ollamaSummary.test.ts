import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InferenceClient } from "./inference";
import { summarizeContent, summarizeWithOllama } from "./ollamaSummary";

const { chat, inference } = vi.hoisted(() => ({
  chat: vi.fn(),
  inference: {} as Record<string, unknown>,
}));
vi.mock("ollama", () => ({
  Ollama: class {
    chat = chat;
  },
}));
vi.mock("./config", () => ({ default: { inference } }));

const source = "Almost all birds returned. Three birds remain unaccounted for.";
const config = {
  baseUrl: "http://localhost:11434",
  textModel: "local-model",
  contextLength: 16384,
  maxOutputTokens: 2048,
  timeoutSec: 90,
};

function response(value: unknown, doneReason = "stop") {
  return {
    done: true,
    done_reason: doneReason,
    message: { content: JSON.stringify(value) },
    prompt_eval_count: 10,
    eval_count: 5,
  };
}

function audit(status = "supported", sourceIds = [1]) {
  return {
    checks: [{ sentence: 1, status, source_ids: sourceIds }],
    material_omission: false,
  };
}

describe("verified Ollama summaries", () => {
  beforeEach(() => {
    chat.mockReset();
    chat.mockResolvedValueOnce(
      response({ sentences: ["Almost all birds returned."] }),
    );
  });

  it("returns only a fully checked summary and counts both calls", async () => {
    chat.mockResolvedValueOnce(response(audit()));
    const result = await summarizeWithOllama(source, "English", [], config);
    expect(result).toMatchObject({
      response: "Almost all birds returned.",
      totalTokens: 30,
    });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[0][0]).toMatchObject({
      stream: false,
      think: false,
      options: { temperature: 0, num_ctx: 16384 },
    });
  });

  it.each(["contradicted", "insufficient"])(
    "rejects a %s claim",
    async (status) => {
      chat.mockResolvedValueOnce(response(audit(status)));
      await expect(
        summarizeWithOllama(source, "English", [], config),
      ).rejects.toThrow();
      expect(chat).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects nonexistent evidence rather than repairing it", async () => {
    chat.mockResolvedValueOnce(response(audit("supported", [2])));
    await expect(
      summarizeWithOllama(source, "English", [], config),
    ).rejects.toThrow();
  });

  it("labels exact source lines without rewriting their delimiters", async () => {
    const article = "Almost all birds returned.\r\nThree remain missing.\n";
    chat.mockResolvedValueOnce(response(audit("supported", [1, 2])));
    await summarizeWithOllama(article, "English", [], config);
    const data = JSON.parse(chat.mock.calls[1][0].messages[1].content);
    expect(data.source).toBe(
      "[S1] Almost all birds returned.\r\n[S2] Three remain missing.\n",
    );
  });

  it("numbers only non-blank lines so every citable ID is evidence", async () => {
    const article = "Almost all birds returned.\n\n \nThree remain missing.\n";
    chat.mockResolvedValueOnce(response(audit("supported", [2])));
    const result = await summarizeWithOllama(article, "English", [], config);
    expect(result?.response).toBe("Almost all birds returned.");
    const request = chat.mock.calls[1][0];
    expect(JSON.parse(request.messages[1].content).source).toBe(
      "[S1] Almost all birds returned.\n\n \n[S2] Three remain missing.\n",
    );
    expect(
      request.format.properties.checks.items.properties.source_ids.items
        .maximum,
    ).toBe(2);
  });

  it("rejects repeated evidence IDs", async () => {
    chat.mockResolvedValueOnce(response(audit("supported", [1, 1])));
    await expect(
      summarizeWithOllama(source, "English", [], config),
    ).rejects.toThrow(/invalid evidence/i);
  });

  it("rejects missing sentence checks", async () => {
    chat.mockResolvedValueOnce(
      response({ checks: [], material_omission: false }),
    );
    await expect(
      summarizeWithOllama(source, "English", [], config),
    ).rejects.toThrow();
  });

  it("rejects duplicate checks instead of treating them as full coverage", async () => {
    const value = audit();
    value.checks.push(value.checks[0]);
    chat.mockResolvedValueOnce(response(value));
    await expect(
      summarizeWithOllama(source, "English", [], config),
    ).rejects.toThrow();
  });

  it("rejects boolean sentence indices", async () => {
    chat.mockResolvedValueOnce(
      response({
        checks: [{ sentence: true, status: "supported", source_ids: [1] }],
        material_omission: false,
      }),
    );
    await expect(
      summarizeWithOllama(source, "English", [], config),
    ).rejects.toThrow();
  });

  it("rejects a truncated audit even when its JSON looks complete", async () => {
    chat.mockResolvedValueOnce(response(audit(), "length"));
    await expect(
      summarizeWithOllama(source, "English", [], config),
    ).rejects.toThrow(/incomplete/i);
  });

  it("rejects material omissions", async () => {
    chat.mockResolvedValueOnce(
      response({ ...audit(), material_omission: true }),
    );
    await expect(
      summarizeWithOllama(source, "English", [], config),
    ).rejects.toThrow();
  });

  it("rejects truncated drafts before auditing", async () => {
    chat
      .mockReset()
      .mockResolvedValueOnce(response({ sentences: ["Partial."] }, "length"));
    await expect(
      summarizeWithOllama(source, "English", [], config),
    ).rejects.toThrow(/incomplete/i);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("declines oversized source without clipping or calling the model", async () => {
    await expect(
      summarizeWithOllama(
        "The council met again today. ".repeat(3000),
        "English",
        [],
        config,
      ),
    ).resolves.toBeNull();
    expect(chat).not.toHaveBeenCalled();
  });

  it("declines oversized audit labels before spending a draft request", async () => {
    await expect(
      summarizeWithOllama("Fact.\n".repeat(4000), "English", [], config),
    ).resolves.toBeNull();
    expect(chat).not.toHaveBeenCalled();
  });

  it("verifies a long article that fits by token count, not bytes", async () => {
    const article =
      "The council approved the budget after a long public debate.\n".repeat(
        600,
      );
    chat.mockResolvedValueOnce(response(audit()));
    const result = await summarizeWithOllama(article, "English", [], config);
    expect(result?.response).toBe("Almost all birds returned.");
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("collapses long whitespace runs like the truncating prompt", async () => {
    chat.mockResolvedValueOnce(response(audit()));
    await summarizeWithOllama(
      `Almost all birds returned.${" ".repeat(20)}Three are missing.`,
      "English",
      [],
      config,
    );
    expect(chat.mock.calls[0][0].messages[1].content).toBe(
      "Almost all birds returned. Three are missing.",
    );
  });

  it("does not report NaN tokens when Ollama omits counts", async () => {
    chat.mockReset();
    for (const value of [
      { sentences: ["Almost all birds returned."] },
      audit(),
    ]) {
      chat.mockResolvedValueOnce({
        ...response(value),
        prompt_eval_count: undefined,
      });
    }
    const result = await summarizeWithOllama(source, "English", [], config);
    expect(result?.totalTokens).toBe(10);
  });

  it("does not call the model on empty input or cancellation", async () => {
    await expect(
      summarizeWithOllama(" ", "English", [], config),
    ).rejects.toThrow();
    await expect(
      summarizeWithOllama(source, "English", [], config, AbortSignal.abort()),
    ).rejects.toThrow();
    expect(chat).not.toHaveBeenCalled();
  });

  it("declines the default 2048 context without throwing or calling the model", async () => {
    await expect(
      summarizeWithOllama(source, "English", [], {
        ...config,
        contextLength: 2048,
      }),
    ).resolves.toBeNull();
    expect(chat).not.toHaveBeenCalled();
  });

  it("keeps finite output caps when Ollama is configured for unlimited output", async () => {
    chat.mockResolvedValueOnce(response(audit()));
    await summarizeWithOllama(source, "English", [], {
      ...config,
      maxOutputTokens: -1,
    });
    expect(
      chat.mock.calls.map(([request]) => request.options.num_predict),
    ).toEqual([768, 1024]);
  });
});

describe("summary path selection", () => {
  const inferFromText = vi.fn();
  const client = { inferFromText } as unknown as InferenceClient;

  beforeEach(() => {
    chat.mockReset();
    inferFromText
      .mockReset()
      .mockResolvedValue({ response: "Plain summary.", totalTokens: 7 });
    Object.assign(inference, {
      ollamaBaseUrl: "http://localhost:11434",
      openAIApiKey: undefined,
      outputSchema: "structured",
      textModel: "local-model",
      contextLength: 16384,
      maxOutputTokens: 2048,
      ollamaKeepAlive: undefined,
      fetchTimeoutSec: 90,
    });
  });

  it("uses verification with native Ollama when the article fits", async () => {
    chat
      .mockResolvedValueOnce(
        response({ sentences: ["Almost all birds returned."] }),
      )
      .mockResolvedValueOnce(response(audit()));
    const result = await summarizeContent(client, "English", [], source);
    expect(result.response).toBe("Almost all birds returned.");
    expect(inferFromText).not.toHaveBeenCalled();
  });

  it("falls back to the truncating prompt at the default 2048 context", async () => {
    inference.contextLength = 2048;
    const result = await summarizeContent(client, "English", [], source);
    expect(result.response).toBe("Plain summary.");
    expect(result.promptSize).toBeGreaterThan(0);
    expect(chat).not.toHaveBeenCalled();
    expect(inferFromText.mock.calls[0][0]).toContain(source);
  });

  it.each(["json", "plain"])(
    "falls back when INFERENCE_OUTPUT_SCHEMA is %s",
    async (outputSchema) => {
      inference.outputSchema = outputSchema;
      await expect(
        summarizeContent(client, "English", [], source),
      ).resolves.toMatchObject({ response: "Plain summary." });
      expect(chat).not.toHaveBeenCalled();
    },
  );

  it("falls back when an OpenAI key selects the OpenAI client", async () => {
    inference.openAIApiKey = "key";
    await summarizeContent(client, "English", [], source);
    expect(chat).not.toHaveBeenCalled();
    expect(inferFromText).toHaveBeenCalledOnce();
  });
});
