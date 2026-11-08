"use client";

import Image from "next/image";
import Link from "next/link";
import { BookmarkMarkdownComponent } from "@/components/dashboard/bookmarks/BookmarkMarkdownComponent";
import { bookmarkLayoutSwitch } from "@/lib/userLocalSettings/bookmarksLayout";
import { cn } from "@/lib/utils";

import type { ZBookmarkTypeText } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";

export default function TextCard({
  bookmark,
  className,
  bookmarkIndex,
}: {
  bookmark: ZBookmarkTypeText;
  className?: string;
  bookmarkIndex?: number;
}) {
  const banner = bookmark.assets.find((a) => a.assetType == "bannerImage");
  return (
    <>
      <BookmarkLayoutAdaptingCard
        title={bookmark.title}
        content={
          <BookmarkMarkdownComponent readOnly={true}>
            {bookmark}
          </BookmarkMarkdownComponent>
        }
        bookmark={bookmark}
        className={className}
        bookmarkIndex={bookmarkIndex}
        image={(layout, className) =>
          bookmarkLayoutSwitch(layout, {
            grid: null,
            compact: null,
            list: banner ? (
              <div className="relative size-full flex-1">
                <Link href={`/dashboard/preview/${bookmark.id}`}>
                  <Image
                    alt="card banner"
                    fill={true}
                    unoptimized
                    className={cn("flex-1", className)}
                    src={getAssetUrl(banner.id)}
                  />
                </Link>
              </div>
            ) : (
              <div
                className={cn(
                  "flex size-full items-center justify-center bg-accent text-center",
                  className,
                )}
              >
                Note
              </div>
            ),
          })
        }
      />
    </>
  );
}
