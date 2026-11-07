import { beforeEach, describe, expect, it, vi } from "vitest";

import { summarizeWithOllama } from "./ollamaSummary";

const { chat } = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock("ollama", () => ({
  Ollama: class {
    chat = chat;
  },
}));

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
    expect(result).toEqual({
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

  it("rejects references to blank source lines", async () => {
    chat.mockResolvedValueOnce(response(audit()));
    await expect(
      summarizeWithOllama(
        "\nAlmost all birds returned.",
        "English",
        [],
        config,
      ),
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

  it("refuses oversized source without clipping or calling the model", async () => {
    await expect(
      summarizeWithOllama("x".repeat(20000), "English", [], config),
    ).rejects.toThrow(/context/i);
    expect(chat).not.toHaveBeenCalled();
  });

  it("rejects oversized audit labels before spending a draft request", async () => {
    await expect(
      summarizeWithOllama("Fact.\n".repeat(1600), "English", [], config),
    ).rejects.toThrow(/context/i);
    expect(chat).not.toHaveBeenCalled();
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

  it("reports the unsupported default context before making a request", async () => {
    await expect(
      summarizeWithOllama(source, "English", [], {
        ...config,
        contextLength: 2048,
      }),
    ).rejects.toThrow(/INFERENCE_CONTEXT_LENGTH/);
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
