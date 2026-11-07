"use client";

import type { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";
import type { ReactNode } from "react";
import { useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "@/lib/auth/client";
import { BOOKMARK_DRAG_MIME } from "@/lib/bookmark-drag";
import useBulkActionsStore from "@/lib/bulkActions";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import {
  bookmarkLayoutSwitch,
  useBookmarkDisplaySettings,
  useBookmarkLayout,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Circle,
  CircleCheck,
  GripVertical,
  Image as ImageIcon,
  NotebookPen,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkTitle,
  isBookmarkStillTagging,
} from "@karakeep/shared/utils/bookmarkUtils";
import { switchCase } from "@karakeep/shared/utils/switch";

import BookmarkActionBar from "./BookmarkActionBar";
import BookmarkFormattedCreatedAt from "./BookmarkFormattedCreatedAt";
import BookmarkOwnerIcon from "./BookmarkOwnerIcon";
import { ArchivedActionIcon, FavouritedActionIcon } from "./icons";
import { NotePreview } from "./NotePreview";
import TagList from "./TagList";

interface Props {
  bookmark: ZBookmark;
  image: (layout: BookmarksLayoutTypes, className: string) => ReactNode;
  title?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bookmarkIndex?: number;
}

function BottomRow({
  footer,
  bookmark,
}: {
  footer?: ReactNode;
  bookmark: ZBookmark;
}) {
  return (
    <div className="justify flex w-full shrink-0 justify-between text-gray-500">
      <div className="flex items-center gap-2 overflow-hidden text-nowrap font-light">
        {footer && <>{footer}•</>}
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          suppressHydrationWarning
        >
          <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
        </Link>
      </div>
      <BookmarkActionBar bookmark={bookmark} />
    </div>
  );
}

function OwnerIndicator({ bookmark }: { bookmark: ZBookmark }) {
  const api = useTRPC();
  const listContext = useBookmarkListContext();
  const collaborators = useQuery(
    api.lists.getCollaborators.queryOptions(
      {
        listId: listContext?.id ?? "",
      },
      {
        refetchOnWindowFocus: false,
        enabled: !!listContext?.hasCollaborators,
      },
    ),
  );

  if (!listContext || listContext.userRole === "owner" || !collaborators.data) {
    return null;
  }

  let owner = undefined;
  if (bookmark.userId === collaborators.data.owner?.id) {
    owner = collaborators.data.owner;
  } else {
    owner = collaborators.data.collaborators.find(
      (c) => c.userId === bookmark.userId,
    )?.user;
  }

  if (!owner) return null;

  return (
    <div className="absolute right-2 top-2 z-40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <BookmarkOwnerIcon ownerName={owner.name} ownerAvatar={owner.image} />
    </div>
  );
}

function BulkEditSelectionOverlay({ bookmark }: { bookmark: ZBookmark }) {
  const isSelected = useBulkActionsStore((s) =>
    s.isBookmarkSelected(bookmark.id),
  );
  const isBulkEditEnabled = useBulkActionsStore((s) => s.isBulkEditEnabled);
  const toggleBookmark = useBulkActionsStore((state) => state.toggleBookmark);
  const { resolvedTheme } = useTheme();
  const { data: session } = useSession();
  const { t } = useTranslation();

  // Don't show selector for non-owned bookmarks or when bulk edit is disabled
  const isOwner = session?.user?.id === bookmark.userId;
  if (!isBulkEditEnabled || !isOwner) return null;

  return (
    <button
      className={cn(
        "absolute left-0 top-0 z-50 h-full w-full bg-opacity-0",
        {
          "bg-opacity-10": isSelected,
        },
        resolvedTheme === "dark" ? "bg-white" : "bg-black",
      )}
      aria-label={t("actions.select")}
      aria-pressed={isSelected}
      onClick={() => toggleBookmark(bookmark.id)}
    ></button>
  );
}

function DragHandle({
  bookmark,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const { isBulkEditEnabled } = useBulkActionsStore();
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData(BOOKMARK_DRAG_MIME, bookmark.id);
      e.dataTransfer.effectAllowed = "copy";

      // Create a small pill element as the drag preview
      const pill = document.createElement("div");
      const title = getBookmarkTitle(bookmark) ?? "Untitled";
      pill.textContent =
        title.length > 40 ? title.substring(0, 40) + "\u2026" : title;
      Object.assign(pill.style, {
        position: "fixed",
        left: "-9999px",
        top: "-9999px",
        padding: "6px 12px",
        borderRadius: "8px",
        backgroundColor: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        fontSize: "13px",
        fontFamily: "inherit",
        color: "hsl(var(--foreground))",
        maxWidth: "240px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      });
      document.body.appendChild(pill);
      e.dataTransfer.setDragImage(pill, 0, 0);
      requestAnimationFrame(() => pill.remove());
    },
    [bookmark],
  );

  if (isBulkEditEnabled) return null;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        "absolute z-40 hidden cursor-grab rounded bg-background/70 p-0.5 opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 [@media(pointer:fine)]:block",
        className,
      )}
    >
      <GripVertical className="size-4 text-muted-foreground" />
    </div>
  );
}

function HoverActionBar({
  bookmark,
  inline = false,
}: {
  bookmark: ZBookmark;
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const enableBulkEditForBookmark = useBulkActionsStore(
    (state) => state.enableBulkEditForBookmark,
  );
  const isBulkEditEnabled = useBulkActionsStore(
    (state) => state.isBulkEditEnabled,
  );
  const isSelected = useBulkActionsStore((state) =>
    state.isBookmarkSelected(bookmark.id),
  );
  const toggleBookmark = useBulkActionsStore((state) => state.toggleBookmark);
  const { data: session } = useSession();
  const demoMode = !!useClientConfig().demoMode;
  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.updated"));
    },
    onError: () => {
      toast.error(t("common.something_went_wrong"));
    },
  });

  const isOwner = session?.user?.id === bookmark.userId;
  if (!isOwner) return null;

  return (
    <div
      className={cn(
        "z-[60] gap-1 rounded bg-white/50 p-1 backdrop-blur-sm transition-opacity duration-200 dark:bg-black/50",
        inline ? "shrink-0" : "absolute right-2 top-2",
        isBulkEditEnabled
          ? "pointer-events-auto flex opacity-100"
          : "pointer-events-none hidden opacity-0 group-hover:opacity-100 [@media(pointer:fine)]:pointer-events-auto [@media(pointer:fine)]:flex",
      )}
    >
      <button
        aria-label={t("actions.bulk_edit")}
        title={t("actions.bulk_edit")}
        className="rounded p-0.5 hover:bg-background/50"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isBulkEditEnabled) {
            toggleBookmark(bookmark.id);
          } else {
            enableBulkEditForBookmark(bookmark.id);
          }
        }}
      >
        {isSelected ? (
          <CircleCheck className="size-4" />
        ) : (
          <Circle className="size-4" />
        )}
      </button>
      {!demoMode && (
        <>
          <button
            title={
              bookmark.favourited
                ? t("actions.unfavorite")
                : t("actions.favorite")
            }
            className="rounded p-0.5 hover:bg-background/50"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              updateBookmarkMutator.mutate({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              });
            }}
          >
            <FavouritedActionIcon favourited={bookmark.favourited} size={16} />
          </button>
          <button
            title={
              bookmark.archived ? t("actions.unarchive") : t("actions.archive")
            }
            className="rounded p-0.5 hover:bg-background/50"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              updateBookmarkMutator.mutate({
                bookmarkId: bookmark.id,
                archived: !bookmark.archived,
              });
            }}
          >
            <ArchivedActionIcon archived={bookmark.archived} size={16} />
          </button>
        </>
      )}
    </div>
  );
}

function ListView({
  bookmark,
  image,
  title,
  content,
  footer,
  className,
  bookmarkIndex,
}: Props) {
  const { showNotes, showTags, showTitle, imageFit } =
    useBookmarkDisplaySettings();
  const imgFitClass = switchCase(imageFit, {
    cover: "object-cover",
    contain: "object-contain",
  });
  const note = showNotes ? bookmark.note?.trim() : undefined;

  return (
    <div
      className={cn(
        "group relative flex max-h-96 gap-4 overflow-hidden rounded-lg p-2",
        className,
      )}
      data-bookmark-index={bookmarkIndex}
    >
      <BulkEditSelectionOverlay bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      <DragHandle
        bookmark={bookmark}
        className="left-1 top-1/2 -translate-y-1/2"
      />
      <HoverActionBar bookmark={bookmark} />
      <div className="flex size-32 items-center justify-center overflow-hidden">
        {image("list", cn("size-32 rounded-lg", imgFitClass))}
      </div>
      <div className="flex h-full flex-1 flex-col justify-between gap-2 overflow-hidden">
        <div className="flex flex-col gap-2 overflow-hidden">
          {showTitle && title && (
            <div className="line-clamp-2 flex-none shrink-0 overflow-hidden text-ellipsis break-words text-lg">
              {title}
            </div>
          )}
          {content && <div className="shrink-1 overflow-hidden">{content}</div>}
          {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
          {showTags && (
            <div className="flex shrink-0 flex-wrap gap-1 overflow-hidden">
              <TagList
                bookmark={bookmark}
                loading={isBookmarkStillTagging(bookmark)}
              />
            </div>
          )}
        </div>
        <BottomRow footer={footer} bookmark={bookmark} />
      </div>
    </div>
  );
}

function SquareGridView({
  bookmark,
  image,
  title,
  content,
  footer,
  className,
  bookmarkIndex,
}: Props) {
  const { showNotes, showTags, showTitle, imageFit } =
    useBookmarkDisplaySettings();
  const imgFitClass = switchCase(imageFit, {
    cover: "object-cover",
    contain: "object-contain",
  });
  const note = showNotes ? bookmark.note?.trim() : undefined;
  const img = image("grid", cn("size-full", imgFitClass));
  const favicon =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.favicon
      : undefined;

  return (
    <div
      className={cn(
        "group relative flex aspect-square flex-col overflow-hidden rounded-xl transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
      data-bookmark-index={bookmarkIndex}
    >
      <BulkEditSelectionOverlay bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      <DragHandle bookmark={bookmark} className="left-2 top-2" />
      <HoverActionBar bookmark={bookmark} />
      {img ? (
        <div className="relative h-[58%] w-full shrink-0 overflow-hidden bg-muted">
          <div className="relative size-full transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
            {img}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      ) : (
        content && (
          <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/40 px-4 pt-4 text-sm leading-relaxed">
            {content}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
          </div>
        )
      )}
      <div
        className={cn(
          "flex min-h-0 flex-col gap-1.5 px-3 pb-2 pt-3",
          img || !content ? "flex-1" : "shrink-0",
        )}
      >
        {footer && (
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {favicon && (
              <Image
                src={favicon}
                alt=""
                aria-hidden
                width={14}
                height={14}
                unoptimized
                className="size-3.5 shrink-0 rounded-sm"
              />
            )}
            <div className="min-w-0 truncate">{footer}</div>
          </div>
        )}
        {showTitle && title && (
          <div className="line-clamp-2 shrink-0 break-words text-[15px] font-semibold leading-snug tracking-tight text-card-foreground">
            {title}
          </div>
        )}
        {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
        {showTags && (
          <div className="flex min-h-0 shrink flex-wrap gap-1 overflow-hidden [max-height:1.6rem]">
            <TagList
              bookmark={bookmark}
              loading={isBookmarkStillTagging(bookmark)}
            />
          </div>
        )}
        <div className="mt-auto flex w-full shrink-0 items-center justify-between text-xs text-muted-foreground">
          <Link
            href={`/dashboard/preview/${bookmark.id}`}
            suppressHydrationWarning
            className="hover:text-foreground"
          >
            <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
          </Link>
          <BookmarkActionBar bookmark={bookmark} />
        </div>
      </div>
    </div>
  );
}

function CompactView({
  bookmark,
  title,
  footer,
  className,
  bookmarkIndex,
}: Props) {
  const { showTitle } = useBookmarkDisplaySettings();
  const isBulkEditEnabled = useBulkActionsStore(
    (state) => state.isBulkEditEnabled,
  );
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg",
        className,
        "max-h-96",
      )}
      data-bookmark-index={bookmarkIndex}
    >
      <BulkEditSelectionOverlay bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      <div className="flex h-full justify-between gap-2 overflow-hidden p-2">
        <div className="flex items-center gap-2">
          {bookmark.content.type === BookmarkTypes.LINK &&
            bookmark.content.favicon && (
              <Image
                src={bookmark.content.favicon}
                alt="favicon"
                width={5}
                unoptimized
                height={5}
                className="size-5"
              />
            )}
          {bookmark.content.type === BookmarkTypes.TEXT && (
            <NotebookPen className="size-5" />
          )}
          {bookmark.content.type === BookmarkTypes.ASSET && (
            <ImageIcon className="size-5" />
          )}
          {showTitle && (
            <div className="shrink-1 text-md line-clamp-1 overflow-hidden text-ellipsis break-words">
              {title ?? "Untitled"}
            </div>
          )}
          {footer && (
            <p className="flex shrink-0 gap-2 text-gray-500">•{footer}</p>
          )}
          <p className="text-gray-500">•</p>
          <Link
            href={`/dashboard/preview/${bookmark.id}`}
            suppressHydrationWarning
            className="shrink-0 gap-2 text-gray-500"
          >
            <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
          </Link>
        </div>
        <div className="relative z-[60] flex shrink-0 items-center">
          <HoverActionBar bookmark={bookmark} inline />
          <BookmarkActionBar
            bookmark={bookmark}
            favouritedClassName={cn(
              "group-hover:hidden",
              isBulkEditEnabled && "hidden",
            )}
          />
        </div>
      </div>
    </div>
  );
}

export function BookmarkLayoutAdaptingCard(props: Props) {
  const layout = useBookmarkLayout();

  return bookmarkLayoutSwitch(layout, {
    grid: <SquareGridView {...props} />,
    list: <ListView {...props} />,
    compact: <CompactView {...props} />,
  });
}
