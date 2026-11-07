import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { transcribeAudio } from "./transcription";

describe("transcribeAudio", () => {
  let dir: string;
  let audio: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "transcription-test-"));
    audio = path.join(dir, "audio.wav");
    await writeFile(audio, "RIFF");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });

  test("posts the file and model to an OpenAI-compatible endpoint", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ text: " Hello there. " })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const text = await transcribeAudio(audio, {
      baseUrl: "http://whisper:8000/v1/",
      apiKey: "secret",
      model: "Systran/faster-whisper-small",
    });

    expect(text).toBe("Hello there.");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://whisper:8000/v1/audio/transcriptions");
    expect(init.headers).toEqual({ Authorization: "Bearer secret" });
    const form = init.body as FormData;
    expect(form.get("model")).toBe("Systran/faster-whisper-small");
    expect((form.get("file") as File).name).toBe("audio.wav");
  });

  test("sends no auth header without a key and reports HTTP errors", async () => {
    const fetchMock = vi.fn(
      async () => new Response("model not found", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeAudio(audio, { baseUrl: "http://whisper:8000/v1", model: "x" }),
    ).rejects.toThrow("Transcription failed with HTTP 404: model not found");
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.headers).toBeUndefined();
  });
});
