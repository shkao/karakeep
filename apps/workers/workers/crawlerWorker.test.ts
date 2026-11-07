import { eq } from "drizzle-orm";
import { Response } from "node-fetch";
import { beforeEach, expect, test, vi } from "vitest";

import { db } from "@karakeep/db";
import { bookmarkLinks, bookmarks, users } from "@karakeep/db/schema";
import { StorageQuotaError } from "@karakeep/shared-server";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import serverConfig from "@karakeep/shared/config";

import { fetchWithProxy } from "../network";
import type { CrawlContext } from "./crawlerWorker";
import { crawlAndParseUrl } from "./crawlerWorker";

const state = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  html: "",
}));

vi.mock("@karakeep/db", async (original) => {
  const actual = await original<typeof import("@karakeep/db")>();
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return { ...actual, db: getInMemoryDB(true) };
});

vi.mock("@karakeep/shared-server", async (original) => {
  const actual = await original<typeof import("@karakeep/shared-server")>();
  return {
    ...actual,
    saveAsset: vi.fn(
      async ({ assetId, asset }: { assetId: string; asset: Buffer }) => {
        state.files.set(assetId, asset);
      },
    ),
    readAsset: vi.fn(async ({ assetId }: { assetId: string }) => {
      const asset = state.files.get(assetId);
      if (!asset) throw new Error("Missing asset");
      return { asset, metadata: { contentType: "text/html" } };
    }),
    silentDeleteAsset: vi.fn(async (_userId: string, assetId: string) => {
      state.files.delete(assetId);
    }),
  };
});

vi.mock("../network", async (original) => ({
  ...(await original<typeof import("../network")>()),
  fetchWithProxy: vi.fn(),
}));

vi.mock("./utils/parseSubprocess", () => ({
  runParseSubprocess: vi.fn(async () => ({
    metadata: { title: "Illustrated article" },
    readableContent: { content: state.html },
    readerViewAssessment: null,
  })),
}));

const controller = () => new AbortController();
const context = (abort: AbortController): CrawlContext => ({
  jobId: "article-test",
  bookmarkId: "article",
  userId: "owner",
  url: "https://example.com/article",
  abortSignal: abort.signal,
  runProxy: { httpProxy: undefined, httpsProxy: undefined, noProxy: undefined },
  browserCrawlingEnabled: false,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
});

async function capture(abort = controller()) {
  const link = await db.query.bookmarkLinks.findFirst({
    where: eq(bookmarkLinks.id, "article"),
  });
  return crawlAndParseUrl(context(abort), {
    oldAssets: {
      screenshotAssetId: undefined,
      pdfAssetId: undefined,
      imageAssetId: undefined,
      contentAssetId: link?.contentAssetId ?? undefined,
    },
    precrawledArchiveAssetId: "archive",
    forceStorePdf: false,
    numRetriesLeft: 0,
    probeMetadataPromise: Promise.resolve(null),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  state.files.clear();
  state.files.set("archive", Buffer.from("<article>Archived source</article>"));
  state.html =
    '<figure><img src="https://example.com/chart.png"><figcaption>Chart</figcaption></figure>';
  await db.delete(users);
  await db
    .insert(users)
    .values({ id: "owner", name: "Owner", email: "owner@example.com" });
  await db
    .insert(bookmarks)
    .values({ id: "article", type: BookmarkTypes.LINK, userId: "owner" });
  await db
    .insert(bookmarkLinks)
    .values({ id: "article", url: "https://example.com/article" });
  vi.mocked(fetchWithProxy).mockImplementation(
    async () =>
      new Response(Buffer.alloc(128), {
        headers: { "content-type": "image/png" },
      }),
  );
});

test("replaces old image files and records together on recrawl", async () => {
  await capture();
  const first = await db.query.assets.findFirst();
  expect(first).toBeDefined();
  await capture();
  const current = await db.query.assets.findMany();
  expect(current).toHaveLength(1);
  expect(current[0].id).not.toBe(first!.id);
  expect(state.files.has(first!.id)).toBe(false);
  expect(state.files.has(current[0].id)).toBe(true);
});

test("keeps the previous capture when a changed image cannot fit the quota", async () => {
  await capture();
  const before = await db.query.bookmarkLinks.findFirst();
  const previous = await db.query.assets.findFirst();
  await db
    .update(users)
    .set({ storageQuota: previous!.size })
    .where(eq(users.id, "owner"));
  state.html = '<img src="https://example.com/new-chart.png">';
  await expect(capture()).rejects.toBeInstanceOf(StorageQuotaError);
  expect((await db.query.bookmarkLinks.findFirst())?.htmlContent).toBe(
    before?.htmlContent,
  );
  expect((await db.query.assets.findMany()).map((asset) => asset.id)).toEqual([
    previous!.id,
  ]);
  expect(state.files.has(previous!.id)).toBe(true);
});

test("cleans staged images when the crawl is aborted", async () => {
  const abort = controller();
  state.html += '<img src="https://example.com/second.png">';
  vi.mocked(fetchWithProxy)
    .mockImplementationOnce(
      async () =>
        new Response(Buffer.alloc(128), {
          headers: { "content-type": "image/png" },
        }),
    )
    .mockImplementationOnce(async () => {
      abort.abort(new Error("cancelled"));
      throw abort.signal.reason;
    });
  await expect(capture(abort)).rejects.toThrow("cancelled");
  expect(await db.query.assets.findMany()).toHaveLength(0);
  expect([...state.files.keys()]).toEqual(["archive"]);
});

test("checks the combined image and HTML storage cost before committing", async () => {
  state.html = `<p>${"Article text. ".repeat(600)}</p><img src="https://example.com/chart.png">`;
  await db
    .update(users)
    .set({ storageQuota: Buffer.byteLength(state.html) + 150 })
    .where(eq(users.id, "owner"));
  await expect(capture()).rejects.toBeInstanceOf(StorageQuotaError);
  expect(await db.query.assets.findMany()).toHaveLength(0);
  expect([...state.files.keys()]).toEqual(["archive"]);
});

test("reuses the previous saved image when its download fails", async () => {
  await capture();
  const previous = await db.query.assets.findFirst();
  vi.mocked(fetchWithProxy).mockRejectedValue(
    new Error("Image host unavailable"),
  );
  await capture();
  expect((await db.query.assets.findMany()).map((asset) => asset.id)).toEqual([
    previous!.id,
  ]);
  expect(state.files.has(previous!.id)).toBe(true);
});

test("counts bytes from oversized responses against the page budget", async () => {
  const previousLimit = Object.getOwnPropertyDescriptor(
    serverConfig,
    "maxAssetSizeMb",
  )!;
  Object.defineProperty(serverConfig, "maxAssetSizeMb", {
    value: 1 / (1024 * 1024),
    configurable: true,
  });
  try {
    // Four downloads run at once; none may start after they blow the budget.
    state.html = Array.from(
      { length: 6 },
      (_, i) => `<img src="https://example.com/image-${i}.png">`,
    ).join("");
    vi.mocked(fetchWithProxy).mockImplementation(
      async () =>
        new Response(Buffer.alloc(2), {
          headers: { "content-type": "image/png" },
        }),
    );
    await capture();
    expect(fetchWithProxy).toHaveBeenCalledTimes(4);
  } finally {
    Object.defineProperty(serverConfig, "maxAssetSizeMb", previousLimit);
  }
});

test("keeps remote URLs for images left when the capture budget runs out", async () => {
  const crawlerConfig = serverConfig.crawler;
  const previousTimeout = Object.getOwnPropertyDescriptor(
    crawlerConfig,
    "jobTimeoutSec",
  )!;
  Object.defineProperty(crawlerConfig, "jobTimeoutSec", {
    value: 0.4,
    configurable: true,
  });
  try {
    state.html = Array.from(
      { length: 8 },
      (_, i) => `<img src="https://example.com/slow-${i}.png">`,
    ).join("");
    vi.mocked(fetchWithProxy).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    const started = Date.now();
    await capture();
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(fetchWithProxy).toHaveBeenCalledTimes(4);
    const link = await db.query.bookmarkLinks.findFirst();
    expect(link?.htmlContent).toContain("https://example.com/slow-7.png");
    expect(await db.query.assets.findMany()).toHaveLength(0);
  } finally {
    Object.defineProperty(crawlerConfig, "jobTimeoutSec", previousTimeout);
  }
});

test("aborts image capture when the job is aborted", async () => {
  const abort = controller();
  vi.mocked(fetchWithProxy).mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(signal.reason));
        abort.abort(new Error("job timed out"));
      }),
  );
  await expect(capture(abort)).rejects.toThrow("job timed out");
  expect(await db.query.bookmarkLinks.findFirst()).toMatchObject({
    crawledAt: null,
  });
});
