import { afterEach, describe, expect, test, vi } from "vitest";

import serverConfig from "@karakeep/shared/config";

import {
  prepareYtDlpArguments,
  redactYtDlpArguments,
  videoContentType,
} from "./videoWorker";

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

    expect(args).toContain(
      "best[filesize<?50M]/best*[acodec!=none][filesize<?50M]",
    );
    expect(args[args.indexOf("--max-filesize") + 1]).toBe("50M");
  });

  test("sets no format or size limit when the max size is 0", () => {
    serverConfig.crawler.maxVideoDownloadSize = 0;

    const args = prepareYtDlpArguments(URL, undefined, "/tmp/asset");

    expect(args).not.toContain("-f");
    expect(args).not.toContain("--max-filesize");
  });
});

test("prints the final file path so sidecar files are never picked", () => {
  const args = prepareYtDlpArguments(URL, undefined, "/tmp/asset");
  expect(args).toEqual(
    expect.arrayContaining(["--no-simulate", "--print", "after_move:filepath"]),
  );
});

test("redacts proxy and cookie values from logged arguments", () => {
  expect(
    redactYtDlpArguments([
      URL,
      "--cookies",
      "/secrets/cookies.txt",
      "--proxy",
      "http://user:pass@proxy:8080",
      "-o",
      "/tmp/asset",
    ]),
  ).toEqual([
    URL,
    "--cookies",
    "[redacted]",
    "--proxy",
    "[redacted]",
    "-o",
    "/tmp/asset",
  ]);
});

describe("videoContentType", () => {
  test.each([
    ["mov,mp4,m4a,3gp,3g2,mj2", "/tmp/a.mp4", "video/mp4"],
    ["matroska,webm", "/tmp/a.webm", "video/webm"],
    ["matroska,webm", "/tmp/a.mkv", "video/x-matroska"],
    ["", "/tmp/a", "video/mp4"],
  ])("maps %s at %s to %s", (format, file, expected) => {
    expect(videoContentType(format, file)).toBe(expected);
  });
});
