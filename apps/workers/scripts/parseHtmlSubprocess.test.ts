import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { JSDOM } from "jsdom";
import { expect, test } from "vitest";

test("preserves article figures with absolute image URLs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "karakeep-article-test-"));
  try {
    const htmlPath = join(directory, "article.html");
    await writeFile(
      htmlPath,
      `<html><head><title>How scientists use Claude</title></head><body>
      <article><h1>How scientists use Claude</h1>
      ${Array.from({ length: 5 }, () => `<p>${"Researchers use Claude across scientific fields. ".repeat(15)}</p>`).join("")}
      <div class="PA4F1q_media-column" data-type="image"><figure><img src="/_next/image?url=%2Fchart.png&w=1920&q=90"
        alt="Claude use across scientific fields">
        <figcaption>Usage relative to researchers.</figcaption></figure></div>
      <figure><img data-src="/lazy-chart.png" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></figure>
      <figure><img src="/small-chart.png" srcset="/small-chart.png 400w, /large-chart.png 1600w"></figure>
      <figure><picture><source srcset="/picture-chart.png 2x"><img alt="Picture chart"></picture></figure>
      <figure><picture><source type="image/avif" srcset="/typed-chart.avif 2x"><source type="image/webp" srcset="/typed-chart.webp 2x"><img alt="Typed chart"></picture></figure>
      <figure><picture><source srcset="/untyped-chart.avif 2x"><img src="/fallback-chart.jpg" alt="AVIF only"></picture></figure>
      </article></body></html>`,
    );
    const result = await execa(
      process.execPath,
      [
        "--import",
        "tsx",
        new URL("./parseHtmlSubprocess.ts", import.meta.url).pathname,
      ],
      {
        input: JSON.stringify({
          htmlPath,
          url: "https://www.anthropic.com/research/how-researchers-use-claude",
          jobId: "article-image-test",
        }),
      },
    );
    const parsed = JSON.parse(result.stdout);
    const dom = new JSDOM(parsed.readableContent.content);
    try {
      expect(
        dom.window.document.querySelector("img")?.getAttribute("src"),
      ).toBe(
        "https://www.anthropic.com/_next/image?url=%2Fchart.png&w=1920&q=90",
      );
      expect(dom.window.document.querySelector("figcaption")?.textContent).toBe(
        "Usage relative to researchers.",
      );
      expect(
        Array.from(dom.window.document.querySelectorAll("img"))
          .slice(1)
          .map((img) => img.getAttribute("src")),
      ).toEqual([
        "https://www.anthropic.com/lazy-chart.png",
        "https://www.anthropic.com/large-chart.png",
        "https://www.anthropic.com/picture-chart.png",
        "https://www.anthropic.com/typed-chart.webp",
        "https://www.anthropic.com/fallback-chart.jpg",
      ]);
    } finally {
      dom.window.close();
    }
  } finally {
    await rm(directory, { recursive: true });
  }
}, 30_000);
