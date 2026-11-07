import fs from "fs";
import * as os from "os";
import path from "path";
import { execa } from "execa";

import { db } from "@karakeep/db";
import { AssetTypes } from "@karakeep/db/schema";
import {
  addLogFields,
  ASSET_TYPES,
  newAssetId,
  QuotaService,
  saveAssetFromFile,
  silentDeleteAsset,
  StorageQuotaError,
  VideoArticleQueue,
  VideoWorkerQueue,
  ZVideoRequest,
  zvideoRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

import { workerStatsCounter } from "../metrics";
import {
  getProxyAgent,
  resolveValidatedRedirectUrl,
  selectRunProxies,
} from "../network";
import { withWorkerEventLog, withWorkerTracing } from "../workerTracing";
import { getBookmarkDetails, updateAsset } from "../workerUtils";

const TMP_FOLDER = path.join(os.tmpdir(), "video_downloads");

export class VideoWorker {
  static async build() {
    logger.info("Starting video worker ...");

    return (await getQueueClient())!.createRunner<ZVideoRequest>(
      VideoWorkerQueue,
      {
        run: withWorkerTracing(
          "videoWorker.run",
          withWorkerEventLog("videoWorker.run", runWorker),
        ),
        onComplete: async (job) => {
          workerStatsCounter.labels("video", "completed").inc();
          const jobId = job.id;
          logger.info(
            `[VideoCrawler][${jobId}] Video Download Completed successfully`,
          );
          return Promise.resolve();
        },
        onError: async (job) => {
          workerStatsCounter.labels("video", "failed").inc();
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("video", "failed_permanent").inc();
          }
          const jobId = job.id;
          logger.error(
            `[VideoCrawler][${jobId}] Video Download job failed: ${job.error}`,
          );
          return Promise.resolve();
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.crawler.downloadVideoTimeout,
        concurrency: 1,
        validator: zvideoRequestSchema,
      },
    );
  }
}

/** Hides values that may hold secrets, such as cookies or proxy credentials. */
export function redactYtDlpArguments(args: string[]) {
  const secretFlags = new Set([
    "--proxy",
    "--cookies",
    "--cookies-from-browser",
    "--add-header",
    "--username",
    "--password",
    "--video-password",
  ]);
  return args.map((arg, i) =>
    i > 0 && secretFlags.has(args[i - 1]) ? "[redacted]" : arg,
  );
}

const CONTENT_TYPES_BY_FORMAT: [string, string][] = [
  ["webm", ASSET_TYPES.VIDEO_WEBM],
  ["matroska", ASSET_TYPES.VIDEO_MKV],
  ["mp4", ASSET_TYPES.VIDEO_MP4],
  ["mov", ASSET_TYPES.VIDEO_MP4],
];

/**
 * Maps ffprobe's format name (for example "mov,mp4,m4a,3gp,3g2,mj2" or
 * "matroska,webm") to a video content type. Checks the file extension first,
 * because ffprobe reports WebM and Matroska with the same name.
 */
export function videoContentType(formatName: string, filePath: string) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === "webm") return ASSET_TYPES.VIDEO_WEBM;
  if (ext === "mkv") return ASSET_TYPES.VIDEO_MKV;
  const formats = formatName.split(",");
  return (
    CONTENT_TYPES_BY_FORMAT.find(([name]) => formats.includes(name))?.[1] ??
    ASSET_TYPES.VIDEO_MP4
  );
}

async function probeContentType(filePath: string, signal: AbortSignal) {
  try {
    const { stdout } = await execa(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=format_name",
        "-of",
        "csv=p=0",
        filePath,
      ],
      { cancelSignal: signal },
    );
    return videoContentType(stdout.trim(), filePath);
  } catch {
    return videoContentType("", filePath);
  }
}

export function prepareYtDlpArguments(
  url: string,
  proxy: string | undefined,
  assetPath: string,
) {
  // yt-dlp performs its own HTTP requests and can follow redirects that this
  // process cannot validate. Full SSRF protection depends on an egress proxy or
  // network policy that blocks internal/private targets.
  const ytDlpArguments = [url];
  if (serverConfig.crawler.maxVideoDownloadSize > 0) {
    const maxSize = `${serverConfig.crawler.maxVideoDownloadSize}M`;
    // Some sites, such as Instagram, don't report format sizes. `<?` keeps
    // those formats, and --max-filesize stops a download that turns out larger.
    // When no combined format qualifies, fall back to any format with audio.
    ytDlpArguments.push(
      "-f",
      `best[filesize<?${maxSize}]/best*[acodec!=none][filesize<?${maxSize}]`,
      "--max-filesize",
      maxSize,
    );
  }

  ytDlpArguments.push(...serverConfig.crawler.ytDlpArguments);
  ytDlpArguments.push("-o", assetPath);
  ytDlpArguments.push("--no-playlist");
  // Print the final file path, so sidecar files such as .info.json are never
  // mistaken for the video.
  ytDlpArguments.push("--no-simulate", "--print", "after_move:filepath");
  if (proxy) {
    ytDlpArguments.push("--proxy", proxy);
  }
  return ytDlpArguments;
}

async function runWorker(job: DequeuedJob<ZVideoRequest>) {
  const jobId = job.id;
  const { bookmarkId, onDemand } = job.data;
  addLogFields<"videoWorker.run">({ "bookmark.id": bookmarkId });

  const {
    url,
    userId,
    videoAssetId: oldVideoAssetId,
  } = await getBookmarkDetails(bookmarkId);

  const downloadEnabled = onDemand
    ? serverConfig.crawler.downloadVideoOnDemand
    : serverConfig.crawler.downloadVideo;
  if (!downloadEnabled) {
    logger.info(
      `[VideoCrawler][${jobId}] Skipping video download from "${url}", because it is disabled in the config.`,
    );
    return;
  }

  const runProxy = selectRunProxies();
  let normalizedUrl: string;
  try {
    const resolvedUrl = await resolveValidatedRedirectUrl(
      url,
      { signal: job.abortSignal },
      runProxy,
    );
    normalizedUrl = resolvedUrl.toString();
  } catch (error) {
    logger.warn(
      `[VideoCrawler][${jobId}] Skipping video download for "${url}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  const videoAssetId = newAssetId();
  let assetPath = `${TMP_FOLDER}/${videoAssetId}`;
  await fs.promises.mkdir(TMP_FOLDER, { recursive: true });

  const proxy = getProxyAgent(normalizedUrl, runProxy);
  const ytDlpArguments = prepareYtDlpArguments(
    normalizedUrl,
    proxy?.proxy.toString(),
    assetPath,
  );

  try {
    logger.info(
      `[VideoCrawler][${jobId}] Attempting to download a file from "${normalizedUrl}" to "${assetPath}" using the following arguments: "${redactYtDlpArguments(ytDlpArguments)}"`,
    );

    const { stdout } = await execa("yt-dlp", ytDlpArguments, {
      cancelSignal: job.abortSignal,
    });
    const downloadPath = stdout.trim().split("\n").at(-1);
    if (!downloadPath || !fs.existsSync(downloadPath)) {
      logger.info(
        `[VideoCrawler][${jobId}] yt-dlp didn't download anything. Skipping ...`,
      );
      return;
    }
    assetPath = downloadPath;
  } catch (e) {
    const err = e as Error;
    if (
      err.message.includes("ERROR: Unsupported URL:") ||
      err.message.includes("No media found")
    ) {
      logger.info(
        `[VideoCrawler][${jobId}] Skipping video download from "${normalizedUrl}", because it's not one of the supported yt-dlp URLs`,
      );
      return;
    }
    const genericError = `[VideoCrawler][${jobId}] Failed to download a file from "${normalizedUrl}" to "${assetPath}"`;
    if ("stderr" in err) {
      logger.error(`${genericError}: ${err.stderr}`);
    } else {
      logger.error(genericError);
    }
    await deleteLeftOverAssetFile(jobId, videoAssetId);
    // Throw so the queue retries transient failures, such as rate limits.
    throw err;
  }

  logger.info(
    `[VideoCrawler][${jobId}] Finished downloading a file from "${normalizedUrl}" to "${assetPath}"`,
  );

  // Get file size and check quota before saving
  const stats = await fs.promises.stat(assetPath);
  const fileSize = stats.size;
  const contentType = await probeContentType(assetPath, job.abortSignal);

  try {
    const quotaApproved = await QuotaService.checkStorageQuota(
      db,
      userId,
      fileSize,
    );

    await saveAssetFromFile({
      userId,
      assetId: videoAssetId,
      assetPath,
      metadata: { contentType },
      quotaApproved,
    });

    await db.transaction((txn) => {
      updateAsset(
        oldVideoAssetId,
        {
          id: videoAssetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_VIDEO,
          contentType,
          size: fileSize,
        },
        txn,
      );
    });
    await silentDeleteAsset(userId, oldVideoAssetId);
    await deleteLeftOverAssetFile(jobId, videoAssetId);

    logger.info(
      `[VideoCrawler][${jobId}] Finished downloading video from "${normalizedUrl}" and adding it to the database`,
    );
    if (serverConfig.videoArticle.enabled) {
      await VideoArticleQueue.enqueue(
        { bookmarkId },
        { idempotencyKey: `video-article:${bookmarkId}`, groupId: userId },
      );
    }
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      logger.warn(
        `[VideoCrawler][${jobId}] Skipping video storage due to quota exceeded: ${error.message}`,
      );
      await deleteLeftOverAssetFile(jobId, videoAssetId);
      return;
    }
    throw error;
  }
}

/**
 * Deletes the files yt-dlp left behind for an asset: partial downloads after a
 * failure, or sidecars such as .info.json after a success.
 *
 * @param jobId the id of the job
 * @param assetId the id of the asset to delete
 */
async function deleteLeftOverAssetFile(
  jobId: string,
  assetId: string,
): Promise<void> {
  let files: string[];
  try {
    files = await fs.promises.readdir(TMP_FOLDER);
  } catch {
    return;
  }
  for (const file of files.filter((f) => f.startsWith(assetId))) {
    const assetFile = path.join(TMP_FOLDER, file);
    logger.info(
      `[VideoCrawler][${jobId}] Deleting leftover video file "${assetFile}".`,
    );
    try {
      await fs.promises.rm(assetFile);
    } catch {
      logger.error(
        `[VideoCrawler][${jobId}] Failed deleting leftover video file "${assetFile}".`,
      );
    }
  }
}
