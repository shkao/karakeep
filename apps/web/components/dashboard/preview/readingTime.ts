import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const WORDS_PER_MINUTE = 230;
// Chinese, Japanese and Korean text has no spaces between words, so count characters.
const CJK_CHARS_PER_MINUTE = 400;
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

export function estimateReadingMinutes(html: string) {
  const text = html.replace(/<[^>]*>/g, " ");
  const cjkChars = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, " ").match(/\S+/g)?.length ?? 0;
  const minutes = words / WORDS_PER_MINUTE + cjkChars / CJK_CHARS_PER_MINUTE;
  return minutes > 0 ? Math.max(1, Math.round(minutes)) : null;
}

export function useReadingMinutes(bookmarkId: string) {
  const api = useTRPC();
  const { data } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      { bookmarkId, includeContent: true },
      {
        select: (bookmark) =>
          bookmark.content.type === BookmarkTypes.LINK &&
          bookmark.content.htmlContent
            ? estimateReadingMinutes(bookmark.content.htmlContent)
            : null,
      },
    ),
  );
  return data ?? null;
}
