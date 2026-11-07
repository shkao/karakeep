"use client";

import Image from "next/image";
import Link from "next/link";
import { useUserSettings } from "@/lib/userSettings";

import type { ZBookmarkTypeLink } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkLinkImageUrl,
  getBookmarkTitle,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";
import FooterLinkURL from "./FooterLinkURL";

const useOnClickUrl = (bookmark: ZBookmarkTypeLink) => {
  const userSettings = useUserSettings();
  return {
    urlTarget:
      userSettings.bookmarkClickAction === "open_original_link"
        ? ("_blank" as const)
        : ("_self" as const),
    onClickUrl:
      userSettings.bookmarkClickAction === "expand_bookmark_preview"
        ? `/dashboard/preview/${bookmark.id}`
        : bookmark.content.url,
  };
};

function LinkTitle({ bookmark }: { bookmark: ZBookmarkTypeLink }) {
  const { onClickUrl, urlTarget } = useOnClickUrl(bookmark);
  const parsedUrl = new URL(bookmark.content.url);
  return (
    <Link href={onClickUrl} target={urlTarget} rel="noreferrer">
      {getBookmarkTitle(bookmark) ?? parsedUrl.host}
    </Link>
  );
}

function LinkPlaceholder({ bookmark }: { bookmark: ZBookmarkTypeLink }) {
  const host = new URL(bookmark.content.url).host.replace(/^www\./, "");
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-muted via-background to-accent">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {bookmark.content.favicon ? (
          <Image
            src={bookmark.content.favicon}
            alt=""
            aria-hidden
            width={28}
            height={28}
            unoptimized
            className="size-7"
          />
        ) : (
          <span className="text-xl font-semibold uppercase text-muted-foreground">
            {host.charAt(0)}
          </span>
        )}
      </div>
      <span className="max-w-[80%] truncate text-xs font-medium text-muted-foreground">
        {host}
      </span>
    </div>
  );
}

function LinkImage({
  bookmark,
  className,
  placeholder = false,
}: {
  bookmark: ZBookmarkTypeLink;
  className?: string;
  placeholder?: boolean;
}) {
  const { onClickUrl, urlTarget } = useOnClickUrl(bookmark);
  const link = bookmark.content;

  const imgComponent = (url: string, unoptimized: boolean) => (
    <Image
      unoptimized={unoptimized}
      className={className}
      alt="card banner"
      fill={true}
      src={url}
    />
  );

  const imageDetails = getBookmarkLinkImageUrl(link);

  let img: React.ReactNode;
  if (isBookmarkStillCrawling(bookmark)) {
    img = imgComponent("/blur.avif", false);
  } else if (imageDetails) {
    img = imgComponent(imageDetails.url, true);
  } else if (placeholder) {
    img = <LinkPlaceholder bookmark={bookmark} />;
  } else {
    // No image found
    // A dummy white pixel for when there's no image.
    img = imgComponent(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdj+P///38ACfsD/QVDRcoAAAAASUVORK5CYII=",
      true,
    );
  }

  return (
    <Link
      href={onClickUrl}
      target={urlTarget}
      rel="noreferrer"
      className={className}
    >
      <div className="relative size-full flex-1">{img}</div>
    </Link>
  );
}

export default function LinkCard({
  bookmark: bookmarkLink,
  className,
  bookmarkIndex,
}: {
  bookmark: ZBookmarkTypeLink;
  className?: string;
  bookmarkIndex?: number;
}) {
  return (
    <BookmarkLayoutAdaptingCard
      title={<LinkTitle bookmark={bookmarkLink} />}
      footer={<FooterLinkURL url={getSourceUrl(bookmarkLink)} />}
      bookmark={bookmarkLink}
      wrapTags={false}
      image={(layout, className) => (
        <LinkImage
          className={className}
          bookmark={bookmarkLink}
          placeholder={layout === "grid"}
        />
      )}
      className={className}
      bookmarkIndex={bookmarkIndex}
    />
  );
}
