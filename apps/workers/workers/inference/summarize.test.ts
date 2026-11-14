import { eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";

import type { ZOpenAIRequest } from "@karakeep/shared-server";
import type { InferenceClient } from "@karakeep/shared/inference";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { db } from "@karakeep/db";
import { bookmarkLinks, bookmarks, users } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { summarizeContent } from "@karakeep/shared/ollamaSummary";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { runSummarization } from "./summarize";

vi.mock("@karakeep/db", async (original) => {
  const actual = await original<typeof import("@karakeep/db")>();
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return { ...actual, db: getInMemoryDB(true) };
});

vi.mock("@karakeep/shared-server", async (original) => ({
  ...(await original<typeof import("@karakeep/shared-server")>()),
  triggerSearchReindex: vi.fn(),
}));

vi.mock("@karakeep/shared/ollamaSummary", () => ({
  summarizeContent: vi.fn(),
}));

const job = {
  id: "job",
  data: { bookmarkId: "b", type: "summarize" },
} as unknown as DequeuedJob<ZOpenAIRequest>;
const inferenceClient = {} as InferenceClient;

async function seed(link: Partial<typeof bookmarkLinks.$inferInsert>) {
  await db.delete(users);
  await db
    .insert(users)
    .values({ id: "owner", name: "Owner", email: "owner@example.com" });
  await db
    .insert(bookmarks)
    .values({ id: "b", type: BookmarkTypes.LINK, userId: "owner" });
  await db
    .insert(bookmarkLinks)
    .values({ id: "b", url: "https://example.com/post", ...link });
}

async function storedSummary() {
  const row = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, "b"),
  });
  return row?.summary ?? null;
}

beforeEach(() => {
  serverConfig.inference.enableAutoSummarization = true;
  vi.mocked(summarizeContent).mockReset();
  vi.mocked(summarizeContent).mockResolvedValue({
    response: "A summary.",
    totalTokens: 1,
    promptSize: 1,
  } as Awaited<ReturnType<typeof summarizeContent>>);
});

test("summarizes a page with real content", async () => {
  await seed({ htmlContent: `<p>${"Real article text. ".repeat(20)}</p>` });

  await runSummarization("b", job, inferenceClient);

  expect(summarizeContent).toHaveBeenCalledOnce();
  expect(await storedSummary()).toBe("A summary.");
});

test("never summarizes a saved challenge page", async () => {
  await seed({
    htmlContent: `<p>${"Real-looking text. ".repeat(20)}</p>`,
    readerViewReasons: ["challenge_page"],
  });

  await runSummarization("b", job, inferenceClient);

  expect(summarizeContent).not.toHaveBeenCalled();
  expect(await storedSummary()).toBeNull();
});

test("leaves a short caption with no body unsummarized", async () => {
  await seed({ description: "If you can't decide, try this experiment." });

  await runSummarization("b", job, inferenceClient);

  expect(summarizeContent).not.toHaveBeenCalled();
});
