import { afterEach, expect, test, vi } from "vitest";

import serverConfig from "@karakeep/shared/config";

import type { CrawlContext } from "./common";
import { remoteCrawler } from "./remoteCrawler";
import { buildRemoteCrawlerRoutes } from "./remoteCrawlerServer";

vi.mock("./localCrawler", () => ({
  localCrawler: {},
  loadPage: vi.fn(async () => ({
    htmlContent: "<html><body>A post</body></html>",
    screenshot: undefined,
    pdf: undefined,
    statusCode: 200,
    url: "https://www.instagram.com/p/abc/",
    coverImageUrl: "https://cdn.example.com/full.jpg",
  })),
  parsePage: vi.fn(async () => ({
    metadata: { title: "A post" },
    readableContent: null,
    readerViewAssessment: null,
  })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the page's cover image survives the trip from a remote crawler", async () => {
  const token = "secret";
  const routes = buildRemoteCrawlerRoutes(token);
  Object.assign(serverConfig.crawler.remote, {
    url: "http://remote",
    token,
  });
  vi.stubGlobal("fetch", (input: string, init: RequestInit) =>
    routes.request(input.replace("http://remote/crawler/v1", ""), init),
  );
  const ctx: CrawlContext = {
    jobId: "job",
    bookmarkId: "bookmark",
    userId: "user",
    url: "https://www.instagram.com/p/abc/",
    abortSignal: new AbortController().signal,
    runProxy: {
      httpProxy: undefined,
      httpsProxy: undefined,
      noProxy: undefined,
    },
    browserCrawlingEnabled: true,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };

  const page = await remoteCrawler.fetchPage(ctx, {
    forceStorePdf: false,
    skipParseOnRetryableStatus: true,
  });

  expect(page).toMatchObject({
    statusCode: 200,
    url: "https://www.instagram.com/p/abc/",
    coverImageUrl: "https://cdn.example.com/full.jpg",
    parsed: { metadata: { title: "A post" } },
  });
});
