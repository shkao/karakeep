import fs from "fs";
import * as os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { eq } from "drizzle-orm";
import { execa } from "execa";
import { z } from "zod";

import { db } from "@karakeep/db";
import { bookmarkVideoArticles, users } from "@karakeep/db/schema";
import {
  addLogFields,
  createAssetReadStream,
  OpenAIQueue,
  triggerSearchReindex,
  VideoArticleQueue,
  ZVideoArticleRequest,
  zVideoArticleRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { buildVideoArticlePrompt } from "@karakeep/shared/prompts";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import { transcribeAudio } from "@karakeep/shared/transcription";

import { workerStatsCounter } from "../metrics";
import {
  getProxyAgent,
  resolveValidatedRedirectUrl,
  selectRunProxies,
} from "../network";
import { withWorkerEventLog, withWorkerTracing } from "../workerTracing";
import { getBookmarkDetails } from "../workerUtils";

export class VideoArticleWorker {
  static async build() {
    logger.info("Starting video article worker ...");

    return (await getQueueClient())!.createRunner<ZVideoArticleRequest>(
      VideoArticleQueue,
      {
        run: withWorkerTracing(
          "videoArticleWorker.run",
          withWorkerEventLog("videoArticleWorker.run", runWorker),
        ),
        onComplete: async (job) => {
          workerStatsCounter.labels("videoArticle", "completed").inc();
          logger.info(`[VideoArticle][${job.id}] Completed successfully`);
          return Promise.resolve();
        },
        onError: async (job) => {
          workerStatsCounter.labels("videoArticle", "failed").inc();
          logger.error(`[VideoArticle][${job.id}] Job failed: ${job.error}`);
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("videoArticle", "failed_permanent").inc();
            const bookmarkId = job.data?.bookmarkId;
            if (bookmarkId) {
              await markFailure(bookmarkId, String(job.error));
            }
          }
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.videoArticle.timeoutSec,
        concurrency: 1,
        validator: zVideoArticleRequestSchema,
      },
    );
  }
}

async function markFailure(bookmarkId: string, error: string) {
  await db
    .update(bookmarkVideoArticles)
    .set({ status: "failure", error: error.slice(0, 1000) })
    .where(eq(bookmarkVideoArticles.id, bookmarkId));
}

async function runFfprobe(
  args: string[],
  signal: AbortSignal,
): Promise<string> {
  const { stdout } = await execa(
    "ffprobe",
    ["-v", "error", ...args, "-of", "csv=p=0"],
    { cancelSignal: signal },
  );
  return stdout.trim();
}

/**
 * Extracts mono 16 kHz audio and transcribes it. Returns an empty string for
 * a video without an audio track.
 */
async function transcribeVideo(
  videoPath: string,
  workDir: string,
  signal: AbortSignal,
): Promise<string> {
  const audioStreams = await runFfprobe(
    ["-select_streams", "a", "-show_entries", "stream=index", videoPath],
    signal,
  );
  if (!audioStreams) {
    return "";
  }
  const audioPath = path.join(workDir, "audio.wav");
  await execa(
    "ffmpeg",
    // Mono 16 kHz PCM is what speech-to-text models expect.
    [
      "-nostdin",
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
    ].concat(["-c:a", "pcm_s16le", audioPath]),
    { cancelSignal: signal },
  );
  const { baseUrl, apiKey, model } = serverConfig.videoArticle.transcription;
  return transcribeAudio(
    audioPath,
    { baseUrl: baseUrl!, apiKey, model },
    signal,
  );
}

const zVideoInfo = z.object({
  description: z.string().nullish(),
  uploader: z.string().nullish(),
  channel: z.string().nullish(),
});

/**
 * Reads the creator's caption and name with yt-dlp, without downloading the
 * video again. Returns null when the metadata can't be fetched.
 */
async function fetchVideoInfo(
  jobId: string,
  url: string,
  signal: AbortSignal,
): Promise<{ caption: string; uploader: string | null } | null> {
  try {
    const runProxy = selectRunProxies();
    // Same guard as the video download: yt-dlp follows redirects itself.
    const resolvedUrl = (
      await resolveValidatedRedirectUrl(url, { signal }, runProxy)
    ).toString();
    const args = [resolvedUrl, "--dump-json", "--skip-download"];
    args.push("--no-playlist", ...serverConfig.crawler.ytDlpArguments);
    const proxy = getProxyAgent(resolvedUrl, runProxy);
    if (proxy) {
      args.push("--proxy", proxy.proxy.toString());
    }
    const { stdout } = await execa("yt-dlp", args, { cancelSignal: signal });
    const info = zVideoInfo.parse(JSON.parse(stdout));
    return {
      caption: info.description ?? "",
      uploader: info.uploader ?? info.channel ?? null,
    };
  } catch (error) {
    logger.warn(
      `[VideoArticle][${jobId}] Couldn't read the video's caption: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/** Returns the first "# " heading of a Markdown article, if any. */
export function extractArticleTitle(markdown: string): string | null {
  const match = /^#\s+(.+?)\s*#*\s*$/m.exec(markdown);
  return match ? match[1] : null;
}

async function runWorker(job: DequeuedJob<ZVideoArticleRequest>) {
  const jobId = job.id;
  const { bookmarkId } = job.data;
  addLogFields<"videoArticleWorker.run">({ "bookmark.id": bookmarkId });

  if (!serverConfig.videoArticle.enabled) {
    logger.info(
      `[VideoArticle][${jobId}] Skipping, video articles are disabled in the config.`,
    );
    return;
  }

  const { url, userId, videoAssetId } = await getBookmarkDetails(bookmarkId);
  if (!videoAssetId) {
    logger.info(
      `[VideoArticle][${jobId}] Skipping, bookmark ${bookmarkId} has no video.`,
    );
    return;
  }

  await db
    .insert(bookmarkVideoArticles)
    .values({ id: bookmarkId, status: "pending" })
    .onConflictDoUpdate({
      target: bookmarkVideoArticles.id,
      set: { status: "pending", error: null },
    });

  const workDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "video_article-"),
  );
  try {
    const videoPath = path.join(workDir, "video");
    await pipeline(
      await createAssetReadStream({ userId, assetId: videoAssetId }),
      fs.createWriteStream(videoPath),
    );

    const duration = Number(
      await runFfprobe(
        ["-show_entries", "format=duration", videoPath],
        job.abortSignal,
      ),
    );
    const maxDuration = serverConfig.videoArticle.maxDurationSec;
    if (duration > maxDuration) {
      // Retrying can't help, so record the reason and stop.
      await markFailure(
        bookmarkId,
        `The video is ${Math.round(duration)}s long, over the ${maxDuration}s limit (VIDEO_ARTICLE_MAX_DURATION_SEC).`,
      );
      return;
    }

    const transcript = await transcribeVideo(
      videoPath,
      workDir,
      job.abortSignal,
    );
    const info = await fetchVideoInfo(jobId, url, job.abortSignal);
    if (!transcript && !info?.caption) {
      await markFailure(
        bookmarkId,
        "The video has no speech and no caption to write an article from.",
      );
      return;
    }

    const inferenceClient = InferenceClientFactory.build();
    if (!inferenceClient) {
      throw new Error("No inference provider is configured.");
    }
    const userSettings = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { inferredTagLang: true },
    });
    const { response } = await inferenceClient.inferFromText(
      buildVideoArticlePrompt(
        userSettings?.inferredTagLang ?? serverConfig.inference.inferredTagLang,
        {
          uploader: info?.uploader ?? null,
          caption: info?.caption ?? "",
          transcript,
        },
      ),
      { schema: null, abortSignal: job.abortSignal },
    );
    const content = response.trim();
    if (!content) {
      throw new Error("The model returned an empty article.");
    }

    await db
      .update(bookmarkVideoArticles)
      .set({
        status: "success",
        title: extractArticleTitle(content),
        content,
        caption: info?.caption ?? null,
        transcript,
        error: null,
      })
      .where(eq(bookmarkVideoArticles.id, bookmarkId));
    logger.info(
      `[VideoArticle][${jobId}] Wrote a ${content.length}-character article from a ${transcript.length}-character transcript.`,
    );

    // Tags, summary and search now read the article (see
    // Bookmark.getBookmarkPlainTextContent), so refresh them.
    const enqueueOpts = { priority: job.priority, groupId: userId };
    await OpenAIQueue.enqueue({ bookmarkId, type: "tag" }, enqueueOpts);
    await OpenAIQueue.enqueue({ bookmarkId, type: "summarize" }, enqueueOpts);
    await triggerSearchReindex(bookmarkId, enqueueOpts);
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}
