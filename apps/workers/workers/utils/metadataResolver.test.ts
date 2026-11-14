import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  hasCapturedContent,
  isStoredChallengePage,
  isLikelyChallengePage,
  isWaitableChallenge,
  resolveMetadata,
} from "./metadataResolver";

function meta(fields: Record<string, string | null | undefined>) {
  return {
    title: null,
    description: null,
    image: null,
    logo: null,
    author: null,
    publisher: null,
    datePublished: null,
    dateModified: null,
    ...fields,
  };
}

describe("resolveMetadata", () => {
  it("returns render metadata untouched when there is no probe metadata", () => {
    const render = meta({ title: "Render Title" });
    expect(resolveMetadata(render, null, false)).toBe(render);
    expect(resolveMetadata(render, null, true)).toBe(render);
  });

  it("prefers render values and fills gaps from the probe on a healthy render", () => {
    const resolved = resolveMetadata(
      meta({ title: "Render Title", image: null }),
      meta({ title: "Probe Title", image: "https://example.com/probe.png" }),
      false,
    );
    expect(resolved.title).toBe("Render Title");
    expect(resolved.image).toBe("https://example.com/probe.png");
  });

  it("prefers probe values and fills gaps from the render on a blocked render", () => {
    const resolved = resolveMetadata(
      meta({ title: "Just a moment...", author: "Render Author" }),
      meta({ title: "Probe Title", author: null }),
      true,
    );
    expect(resolved.title).toBe("Probe Title");
    expect(resolved.author).toBe("Render Author");
  });

  it("treats empty strings as missing", () => {
    const resolved = resolveMetadata(
      meta({ title: "", description: "" }),
      meta({ title: "Probe Title" }),
      false,
    );
    expect(resolved.title).toBe("Probe Title");
    expect(resolved.description).toBeNull();
  });

  it("preserves extra fields from the render metadata", () => {
    const resolved = resolveMetadata(
      meta({ title: "Render Title", lang: "en" }),
      meta({ title: "Probe Title" }),
      false,
    );
    expect(resolved.lang).toBe("en");
  });

  it("does not mutate its inputs", () => {
    const render = meta({ title: null });
    const probe = meta({ title: "Probe Title" });
    resolveMetadata(render, probe, false);
    expect(render.title).toBeNull();
    expect(probe.title).toBe("Probe Title");
  });
});

describe("isLikelyChallengePage", () => {
  it("detects known challenge-page titles regardless of case and whitespace", () => {
    expect(isLikelyChallengePage({ title: "Just a moment..." })).toBe(true);
    expect(isLikelyChallengePage({ title: "  JUST A MOMENT...  " })).toBe(true);
    expect(
      isLikelyChallengePage({ title: "Attention Required! | Cloudflare" }),
    ).toBe(true);
    expect(isLikelyChallengePage({ title: "Access Denied" })).toBe(true);
    expect(isLikelyChallengePage({ title: "Robot Check" })).toBe(true);
    expect(isLikelyChallengePage({ title: "Robot or human?" })).toBe(true);
  });

  it("does not match challenge titles as substrings of real titles", () => {
    expect(
      isLikelyChallengePage({
        title: "Access denied: a deep dive into HTTP 403 semantics",
      }),
    ).toBe(false);
  });

  it("detects challenge markers in small page bodies", () => {
    expect(
      isLikelyChallengePage({
        title: "example.com",
        htmlContent: `<html><body><script>window._cf_chl_opt = {};</script></body></html>`,
      }),
    ).toBe(true);
    expect(
      isLikelyChallengePage({
        htmlContent: `<html><body><div id="px-captcha"></div></body></html>`,
      }),
    ).toBe(true);
    expect(
      isLikelyChallengePage({
        htmlContent: `<html><body><iframe src="https://geo.captcha-delivery.com/captcha/"></iframe></body></html>`,
      }),
    ).toBe(true);
    expect(
      isLikelyChallengePage({
        htmlContent: `<html><body><p>Checking your browser before accessing example.com</p></body></html>`,
      }),
    ).toBe(true);
  });

  it("detects the WeChat environment-verification page", () => {
    const htmlContent = readFileSync(
      path.join(__dirname, "__fixtures__", "wechat-verification.html"),
      "utf8",
    );
    expect(isLikelyChallengePage({ title: "", htmlContent })).toBe(true);
    // Desktop browsers retitle the page after load.
    expect(isLikelyChallengePage({ title: "微信公众平台", htmlContent })).toBe(
      true,
    );
  });

  it("does not flag WeChat articles, including ones quoting the verification copy", () => {
    const article = (body: string) =>
      `<html><head><title>文章</title></head><body><div id="js_content">${body}</div>` +
      `<script>var PAGE_MID='mmbizwap:appmsg/index.html';</script></body></html>`;
    expect(
      isLikelyChallengePage({
        title: "文章",
        htmlContent: article("<p>今天聊聊大型語言模型。</p>"),
      }),
    ).toBe(false);
    expect(
      isLikelyChallengePage({
        title: "为什么微信提示环境异常",
        htmlContent: article(
          "<h2>环境异常</h2><p>很多人打开文章时看到「当前环境异常，完成验证后即可继续访问。」</p>",
        ),
      }),
    ).toBe(false);
  });

  it("ignores body markers in large documents (e.g. articles quoting them)", () => {
    const article =
      `<html><body><p>Cloudflare shows "checking your browser before accessing" on its interstitial.</p>` +
      `<p>${"lorem ipsum ".repeat(10_000)}</p></body></html>`;
    expect(isLikelyChallengePage({ htmlContent: article })).toBe(false);
  });

  it("does not flag normal pages that merely mention bot-protection vendors", () => {
    expect(
      isLikelyChallengePage({
        title: "How Cloudflare and DataDome detect bots",
        htmlContent:
          "<html><body><p>An overview of Cloudflare, DataDome, PerimeterX and Akamai bot protection.</p></body></html>",
      }),
    ).toBe(false);
  });

  it("returns false for missing inputs", () => {
    expect(isLikelyChallengePage({})).toBe(false);
    expect(isLikelyChallengePage({ title: null, htmlContent: null })).toBe(
      false,
    );
  });
});

describe("isWaitableChallenge", () => {
  it("waits on Cloudflare's interstitial", () => {
    expect(
      isWaitableChallenge(
        "Just a moment...",
        "<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={}</script></body></html>",
      ),
    ).toBe(true);
  });

  it("waits on DataDome's device check", () => {
    expect(
      isWaitableChallenge(
        "wsj.com",
        "<html><body><script>var dd={'rt':'i','cid':'x','host':'geo.captcha-delivery.com'}</script></body></html>",
      ),
    ).toBe(true);
  });

  it("doesn't wait on DataDome's captcha, which needs a human", () => {
    expect(
      isWaitableChallenge(
        "wsj.com",
        "<html><body><script>var dd={'rt':'c','cid':'x','host':'geo.captcha-delivery.com'}</script></body></html>",
      ),
    ).toBe(false);
  });

  it("doesn't wait on regular pages", () => {
    expect(
      isWaitableChallenge(
        "Example Domain",
        "<html><head><title>Example Domain</title></head><body><p>Hello</p></body></html>",
      ),
    ).toBe(false);
  });
});

describe("hasCapturedContent", () => {
  it("keeps stored content that wasn't a challenge page", () => {
    expect(
      hasCapturedContent({
        htmlContent: "<p>article</p>",
        contentAssetId: undefined,
        readerViewReasons: ["probably_readerable"],
      }),
    ).toBe(true);
    expect(
      hasCapturedContent({
        htmlContent: null,
        contentAssetId: "asset",
        readerViewReasons: null,
      }),
    ).toBe(true);
  });

  it("has nothing to keep without content or when it was a challenge page", () => {
    expect(
      hasCapturedContent({
        htmlContent: null,
        contentAssetId: undefined,
        readerViewReasons: null,
      }),
    ).toBe(false);
    expect(
      hasCapturedContent({
        htmlContent: "<p>环境异常</p>",
        contentAssetId: undefined,
        readerViewReasons: ["challenge_page"],
      }),
    ).toBe(false);
  });

  it("treats an unflagged WeChat verification extract as nothing to keep", () => {
    // What rows crawled before the WeChat detector existed hold.
    expect(
      hasCapturedContent({
        htmlContent: WECHAT_STORED_EXTRACT,
        contentAssetId: undefined,
        readerViewReasons: ["probably_readerable"],
      }),
    ).toBe(false);
  });
});

const WECHAT_STORED_EXTRACT =
  "  <h2>环境异常</h2> <p>当前环境异常，完成验证后即可继续访问。</p>: ，. Video Mini Program Like ，轻点两下取消赞 Wow ，轻点两下取消在看 ";

describe("isStoredChallengePage", () => {
  it("flags the stored WeChat verification extract", () => {
    expect(isStoredChallengePage({ htmlContent: WECHAT_STORED_EXTRACT })).toBe(
      true,
    );
  });

  it("doesn't flag an article that quotes the verification message", () => {
    const article = `<p>${"正文内容。".repeat(600)}</p><p>当前环境异常，完成验证后即可继续访问。</p>`;
    expect(isStoredChallengePage({ htmlContent: article })).toBe(false);
  });
});
