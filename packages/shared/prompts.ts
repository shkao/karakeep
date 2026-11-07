import type { ZTagStyle } from "./types/users";
import {
  getCuratedTagsPrompt,
  getTagStylePrompt,
  getPotentialRelevantTagsPrompt,
} from "./utils/tag";

/**
 * Remove duplicate whitespaces to avoid tokenization issues
 */
function preprocessContent(content: string) {
  return content.replace(/(\s){10,}/g, "$1");
}

export function buildImagePrompt(
  lang: string,
  customPrompts: string[],
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  potentialRelevantTags?: string[],
) {
  const tagStyleInstruction = getTagStylePrompt(tagStyle);
  const curatedInstruction = getCuratedTagsPrompt(curatedTags);
  const potentialRelevantTagsInstruction = getPotentialRelevantTagsPrompt(
    potentialRelevantTags,
  );

  return `
You are an expert whose responsibility is to help with automatic tagging for a read-it-later/bookmarking app.
Analyze the attached image and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Prefer concrete, durable tags: named products, technologies, projects, standards, subject areas, and important concepts.
- For photos, artwork, and other non-textual images, tag the visual subject matter: scenes, places, landscapes, nature, objects, people, activities, and style.
- Include only retrieval-worthy tags that describe the saved item's intended content, not incidental UI or page chrome.
- The tags must be in ${lang}.
- Keep each tag short: ideally 1-3 words. Do not include parenthetical explanations, comma-separated examples, or long descriptive phrases inside a tag.
- Prefer durable subject tags over one-off facts, examples, source organizations, page sections, or implementation details unless they are central to the whole item.
- Do NOT generate any tags if the image is mainly:
    - A screenshot of an error, unavailable, forbidden, unauthorized, not found, DNS, timeout, or service failure page
    - A Cloudflare/security check, CAPTCHA, bot check, anti-DDoS challenge, browser verification, or access-blocked page
    - Boilerplate content such as cookie consent, login walls, GDPR notices, navigation menus, or a blank or solid-color image with no discernible subject
  In these cases, return an empty tags array. Do not tag the failure/interstitial page itself.
- Aim for 10-15 tags.
- If there are no good tags, leave the array empty.
${curatedInstruction}
${potentialRelevantTagsInstruction}
${tagStyleInstruction}
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
You must respond in valid JSON with the key "tags" and the value is list of tags. Don't wrap the response in a markdown code.`;
}

/**
 * Construct tagging prompt for text content
 */
export function constructTextTaggingPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  potentialRelevantTags?: string[],
): string {
  const tagStyleInstruction = getTagStylePrompt(tagStyle);
  const curatedInstruction = getCuratedTagsPrompt(curatedTags);
  const potentialRelevantTagsInstruction = getPotentialRelevantTagsPrompt(
    potentialRelevantTags,
  );

  return `
You are an expert whose responsibility is to help with automatic tagging for a read-it-later/bookmarking app.
Analyze the TEXT_CONTENT below and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Prefer concrete, durable tags: named products, technologies, projects, standards, subject areas, and important concepts.
- Include only retrieval-worthy tags that describe the saved item's intended content, not incidental page chrome.
- The tags must be in ${lang}.
- Keep each tag short: ideally 1-3 words. Do not include parenthetical explanations, comma-separated examples, or long descriptive phrases inside a tag.
- Prefer durable subject tags over one-off facts, examples, source organizations, page sections, or implementation details unless they are central to the whole item.
- Ignore any part of the content that is:
    - An error, unavailable, forbidden, unauthorized, not found, DNS, timeout, or service failure page
    - A Cloudflare/security check, CAPTCHA, bot check, anti-DDoS challenge, browser verification, or access-blocked page
    - Boilerplate content such as cookie consent, login walls, GDPR notices, navigation menus, or empty pages
  If useful metadata or other legitimate content remains, generate tags using only that information. Otherwise, return an empty tags array. Never tag the failure, interstitial, or boilerplate content itself.
- Aim for 3-5 tags.
- If there are no good tags, leave the array empty.
${curatedInstruction}
${potentialRelevantTagsInstruction}
${tagStyleInstruction}
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}

<TEXT_CONTENT>
${content}
</TEXT_CONTENT>
You must respond in JSON with the key "tags" and the value is an array of string tags.`;
}

/**
 * Construct summary prompt
 */
export function constructSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return `
Summarize the following content responding ONLY with the summary. You MUST follow the following rules:
- Summary must be in 3-4 sentences.
- The summary must be in ${lang}.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
    ${content}`;
}

/**
 * Build text tagging prompt without truncation (for previews/UI)
 */
export function buildTextPromptUntruncated(
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
): string {
  return constructTextTaggingPrompt(
    lang,
    customPrompts,
    preprocessContent(content),
    tagStyle,
    curatedTags,
  );
}

/**
 * Build summary prompt without truncation (for previews/UI)
 */
export function buildSummaryPromptUntruncated(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return constructSummaryPrompt(
    lang,
    customPrompts,
    preprocessContent(content),
  );
}

/**
 * Build the prompt that turns a video's caption and speech transcript into a
 * self-contained article the reader can learn from without watching.
 */
export function buildVideoArticlePrompt(
  lang: string,
  sources: { uploader: string | null; caption: string; transcript: string },
): string {
  return `You write a self-contained article that teaches what a short video says, so the reader learns everything useful without watching it.

Sources: the creator's caption and the speech transcript below. Use only these. Ignore hashtags, follower counts, comments, calls to follow, like or subscribe, and self-promotion.

Write Markdown in this order:
1. A "# " title that names the topic (never "Video by ...").
2. An opening paragraph: what the video is about, who is speaking if the sources say so, and why it matters.
3. "## " sections, one per main idea. Explain each idea in full sentences with the context needed to understand it on its own. Keep the speaker's examples and reasoning. Prefer explanation over bullet lists.
4. "## Key takeaways": 3 to 6 bullets, each a complete statement the reader can act on or remember.

Rules: never invent facts, numbers, names or links. If the speaker points at something only shown on screen, say it was shown in the video. Fix an obvious mis-hearing only when the caption gives the right spelling. If the transcript is empty, write the article from the caption alone. Write in ${lang}. Output only the article.

Uploader: ${sources.uploader ?? "unknown"}

Caption:
${sources.caption || "(none)"}

Transcript:
${sources.transcript || "(no speech)"}`;
}

/**
 * Build OCR prompt for extracting text from images using LLM
 */
export function buildOCRPrompt(): string {
  return `You are an OCR (Optical Character Recognition) expert. Your task is to extract ALL text from this image.

Rules:
- Extract every piece of text visible in the image, including titles, body text, captions, labels, watermarks, and any other textual content.
- Preserve the original structure and formatting as much as possible (e.g., paragraphs, lists, headings).
- If text appears in multiple columns, read from left to right, top to bottom.
- If text is partially obscured or unclear, make your best attempt and indicate uncertainty with [unclear] if needed.
- Do not add any commentary, explanations, or descriptions of non-text elements.
- If there is no text in the image, respond with an empty string.
- Output ONLY the extracted text, nothing else.`;
}
