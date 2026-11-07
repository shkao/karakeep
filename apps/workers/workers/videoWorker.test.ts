import { afterEach, describe, expect, test, vi } from "vitest";

import serverConfig from "@karakeep/shared/config";

import { prepareYtDlpArguments } from "./videoWorker";

vi.mock("@karakeep/db", async (original) => {
  const actual = await original<typeof import("@karakeep/db")>();
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return { ...actual, db: getInMemoryDB(true) };
});

const URL = "https://www.instagram.com/reel/DePGBFXtswr/";
const originalMaxSize = serverConfig.crawler.maxVideoDownloadSize;

afterEach(() => {
  serverConfig.crawler.maxVideoDownloadSize = originalMaxSize;
});

describe("prepareYtDlpArguments", () => {
  test("keeps formats with an unknown size and caps the download size", () => {
    serverConfig.crawler.maxVideoDownloadSize = 50;

    const args = prepareYtDlpArguments(URL, undefined, "/tmp/asset");

    expect(args).toContain("best[filesize<?50M]");
    expect(args[args.indexOf("--max-filesize") + 1]).toBe("50M");
  });

  test("sets no format or size limit when the max size is 0", () => {
    serverConfig.crawler.maxVideoDownloadSize = 0;

    const args = prepareYtDlpArguments(URL, undefined, "/tmp/asset");

    expect(args).not.toContain("-f");
    expect(args).not.toContain("--max-filesize");
  });
});
