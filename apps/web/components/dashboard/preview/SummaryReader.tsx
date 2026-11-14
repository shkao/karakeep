import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { ExternalLink } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { READER_FONT_FAMILIES } from "@karakeep/shared/types/readers";
import { getBookmarkLinkImageUrl } from "@karakeep/shared/utils/bookmarkUtils";

import SummarizeBookmarkArea from "../bookmarks/SummarizeBookmarkArea";

/**
 * A static reading view of a link bookmark's AI summary, for posts whose
 * page and embeds don't read well (Instagram). Falls back to the caption
 * until a summary exists.
 */
export default function SummaryReader({
  bookmark,
  readOnly,
}: {
  bookmark: ZBookmark;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const { settings } = useReaderSettings();
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }
  const link = bookmark.content;
  const image = getBookmarkLinkImageUrl(link);
  const body = bookmark.summary ?? link.description;

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 sm:px-6">
      <article
        className="mx-auto max-w-2xl space-y-6 py-8"
        style={{
          fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
          fontSize: `${settings.fontSize}px`,
          lineHeight: settings.lineHeight,
        }}
      >
        {image ? (
          // Instagram images run from 4:5 to 1.91:1 and often carry text, so
          // show all of it rather than cropping.
          <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-lg bg-muted">
            <Image
              src={image.url}
              alt=""
              fill
              unoptimized
              className="object-contain"
              sizes="384px"
            />
          </div>
        ) : null}
        {link.author ? (
          <p className="text-sm text-muted-foreground">{link.author}</p>
        ) : null}
        {body ? (
          <MarkdownReadonly>{body}</MarkdownReadonly>
        ) : (
          <p className="text-muted-foreground">{link.title}</p>
        )}
        {!bookmark.summary ? (
          <SummarizeBookmarkArea bookmark={bookmark} readOnly={readOnly} />
        ) : null}
        <Link
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="size-4" />
          {t("preview.open_original")}
        </Link>
      </article>
    </div>
  );
}
