import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const zTranscriptionResponse = z.object({ text: z.string() });

export interface TranscriptionConfig {
  // OpenAI-compatible API root, e.g. https://api.openai.com/v1 or a local
  // whisper server's http://whisper:8000/v1.
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/**
 * Transcribes an audio file through an OpenAI-compatible
 * `POST {baseUrl}/audio/transcriptions` endpoint and returns the text.
 */
export async function transcribeAudio(
  filePath: string,
  config: TranscriptionConfig,
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  form.append("model", config.model);
  form.append("response_format", "json");
  form.append(
    "file",
    new Blob([await readFile(filePath)]),
    path.basename(filePath),
  );

  const response = await fetch(
    `${config.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`,
    {
      method: "POST",
      body: form,
      headers: config.apiKey
        ? { Authorization: `Bearer ${config.apiKey}` }
        : undefined,
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Transcription failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  return zTranscriptionResponse.parse(await response.json()).text.trim();
}
