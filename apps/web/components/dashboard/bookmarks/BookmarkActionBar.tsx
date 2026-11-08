import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { useUserSettings } from "@/lib/userSettings";
import { cn } from "@/lib/utils";
import { ExternalLink, Maximize2 } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getSourceUrl } from "@karakeep/shared/utils/bookmarkUtils";

import BookmarkOptions from "./BookmarkOptions";
import { FavouritedActionIcon } from "./icons";

export default function BookmarkActionBar({
  bookmark,
  favouritedClassName,
}: {
  bookmark: ZBookmark;
  favouritedClassName?: string;
}) {
  const { t } = useTranslation();
  const userSettings = useUserSettings();
  // The title and card already open the preview, except for links set to open the original page.
  const showPreviewButton =
    bookmark.content.type === BookmarkTypes.LINK &&
    userSettings.bookmarkClickAction === "open_original_link";
  // Cards don't show the source URL, so offer it here unless clicking the card
  // already opens it.
  const sourceUrl = showPreviewButton ? null : getSourceUrl(bookmark);
  return (
    <div className="flex text-gray-500">
      {bookmark.favourited && (
        <FavouritedActionIcon
          className={cn("m-1 size-8 rounded p-1", favouritedClassName)}
          favourited
        />
      )}
      {showPreviewButton && (
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "px-2 has-[>svg]:px-2",
          )}
        >
          <Maximize2 size={16} />
        </Link>
      )}
      {sourceUrl && (
        <Link
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          title={t("preview.open_original")}
          aria-label={t("preview.open_original")}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "px-2 has-[>svg]:px-2",
          )}
        >
          <ExternalLink size={16} />
        </Link>
      )}
      <BookmarkOptions bookmark={bookmark} />
    </div>
  );
}
